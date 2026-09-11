export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { refreshMLToken } from "@/lib/integrations/mercadolibre";

const TIENDAS_FRET = new Set([
  "cmouw44ej0004thpecq6bct35",
  "cmouw23l60003thpe1q7f16r3",
  "cmpbfadyd00032vgl7klna40b",
  "cmpk7nslz0006r5e73du6f0kp",
  "cmovurlze000018duer7sffp4",
  "cmt2181g800072mm41q6pfsb9",
]);

// Cache de tokens ya renovados en esta ejecución
const tokenCache = new Map<string, string>();

async function getTokenForStore(storeId: string): Promise<string | null> {
  if (tokenCache.has(storeId)) return tokenCache.get(storeId)!;

  const integration = await prisma.storeIntegration.findFirst({
    where: { storeId, platform: "MERCADOLIBRE", isActive: true },
  });
  if (!integration) return null;

  const creds = decrypt(integration.apiKeyEnc);
  let accessToken: string;
  let refreshToken: string;

  if (creds.startsWith("{")) {
    const parsed = JSON.parse(creds);
    accessToken = parsed.accessToken;
    refreshToken = parsed.refreshToken;
  } else {
    [accessToken, refreshToken] = creds.split("|");
  }

  // Test token
  const test = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (test.status === 401 || test.status === 403) {
    try {
      const refreshed = await refreshMLToken(refreshToken);
      await prisma.storeIntegration.update({
        where: { id: integration.id },
        data: {
          apiKeyEnc: encrypt(
            `${refreshed.accessToken}|${refreshed.refreshToken}`,
          ),
          refreshToken: refreshed.refreshToken,
          lastSyncAt: new Date(),
        },
      });
      console.log("[ML cron] 🔄 Token renovado para storeId:", storeId);
      tokenCache.set(storeId, refreshed.accessToken);
      return refreshed.accessToken;
    } catch (err: any) {
      console.error("[ML cron] ❌ Refresh falló:", storeId, err.message);
      return null;
    }
  }

  tokenCache.set(storeId, accessToken);
  return accessToken;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tresDiasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      platform: "MERCADOLIBRE",
      status: { in: ["PENDING", "RECEIVED", "IN_TRANSIT"] },
      sourceId: { not: null },
      createdAt: { gte: tresDiasAtras },
    },
    select: {
      id: true,
      orderNumber: true,
      sourceId: true,
      storeId: true,
      status: true,
      externalId: true,
      rawPayload: true,
    },
    take: 30,
    orderBy: { createdAt: "asc" },
  });

  const results: any[] = [];

  for (const order of orders) {
    const token = await getTokenForStore(order.storeId);
    if (!token) continue;

    try {
      const orderId = order.sourceId!;
      const res = await fetch(
        `https://api.mercadolibre.com/orders/${orderId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        console.error("[ML cron] Error API:", order.orderNumber, res.status);
        continue;
      }

      const mlOrder = await res.json();
      const shippingId = (order.rawPayload as any)?.shipping?.id;

      let shipment: any = null;
      if (shippingId) {
        try {
          const shipRes = await fetch(
            `https://api.mercadolibre.com/shipments/${shippingId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (shipRes.ok) shipment = await shipRes.json();
        } catch {}
      }

      const mlStatus =
        shipment?.status ?? mlOrder.shipping?.status ?? mlOrder.status;

      if (mlStatus === "delivered") {
        const deliveredDate =
          shipment?.status_history?.date_delivered ?? new Date().toISOString();

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(deliveredDate),
            mlShippedAt: new Date(),
            events: {
              create: {
                status: "DELIVERED",
                note: "Entrega confirmada por Moovex (respaldo Flex)",
                createdBy: "ml-cron-check",
              },
            },
          },
        });

        if (
          TIENDAS_FRET.has(order.storeId) ||
          order.externalId?.startsWith("FR-")
        ) {
          try {
            const { notificarEntregaAFret } =
              await import("@/lib/services/fret.service");
            await notificarEntregaAFret({
              referencia: order.orderNumber.replace("#", ""),
              shipmentId: shippingId ? String(shippingId) : null,
              fecha: deliveredDate,
            });
            console.log("[ML cron] ✅ Notificado a Fret:", order.orderNumber);
          } catch (err) {
            console.error(
              "[ML cron] Error notificando a Fret:",
              order.orderNumber,
              err,
            );
          }
        }

        try {
          const { notifyWebhooks } =
            await import("@/lib/services/webhook.service");
          await notifyWebhooks(order.id, "DELIVERED", order.status);
        } catch {}

        console.log("[ML cron] ✅ Cerrado:", order.orderNumber);
        results.push({
          orderNumber: order.orderNumber,
          status: "cerrado_por_flex",
          mlStatus,
        });
      } else if (mlStatus === "shipped") {
        await prisma.order.update({
          where: { id: order.id },
          data: { mlShippedAt: new Date() },
        });

        const esTiendaFret =
          TIENDAS_FRET.has(order.storeId) ||
          order.externalId?.startsWith("FR-");
        results.push({
          orderNumber: order.orderNumber,
          status: esTiendaFret ? "fret_en_curso" : "now_en_curso",
          mlStatus,
        });
      } else {
        results.push({
          orderNumber: order.orderNumber,
          status: "sin_cambio",
          mlStatus,
        });
      }
    } catch (err: any) {
      console.error("[ML cron] Error:", order.orderNumber, err.message);
    }
  }

  return NextResponse.json({ ok: true, checked: orders.length, results });
}
