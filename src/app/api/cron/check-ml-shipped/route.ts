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
      mlShippedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[ML cron] Revisando ${orders.length} pedidos ML activos`);

  const results: any[] = [];
  let cerrados = 0;
  let escaneados = 0;
  let errores = 0;

  for (const order of orders) {
    const token = await getTokenForStore(order.storeId);
    if (!token) {
      errores++;
      continue;
    }

    try {
      const shippingId = (order.rawPayload as any)?.shipping?.id;
      if (!shippingId) continue;

      // Consultar shipment directo (más rápido que consultar la orden)
      const shipRes = await fetch(
        `https://api.mercadolibre.com/shipments/${shippingId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!shipRes.ok) {
        if (shipRes.status !== 404) {
          console.error(
            "[ML cron] Error shipment:",
            order.orderNumber,
            shipRes.status,
          );
          errores++;
        }
        continue;
      }

      const shipment = await shipRes.json();
      const mlStatus = shipment?.status;
      const dateShipped = shipment?.status_history?.date_shipped;

      // ── DELIVERED: cerrar pedido ──
      if (mlStatus === "delivered") {
        const deliveredDate =
          shipment?.status_history?.date_delivered ?? new Date().toISOString();

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(deliveredDate),
            mlShippedAt: dateShipped ? new Date(dateShipped) : new Date(),
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
              shipmentId: String(shippingId),
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

        cerrados++;
        results.push({
          orderNumber: order.orderNumber,
          status: "cerrado_por_flex",
          mlStatus,
        });

        // ── SHIPPED: registrar escaneo ──
      } else if (mlStatus === "shipped" && !order.mlShippedAt) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            mlShippedAt: dateShipped ? new Date(dateShipped) : new Date(),
          },
        });
        escaneados++;
        results.push({
          orderNumber: order.orderNumber,
          status: "escaneo_registrado",
          mlStatus,
        });

        // ── CANCELLED / NOT_DELIVERED: cerrar como INCIDENT ──
      } else if (mlStatus === "cancelled" || mlStatus === "not_delivered") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "INCIDENT",
            events: {
              create: {
                status: "INCIDENT",
                note:
                  mlStatus === "cancelled"
                    ? "ML Flex canceló el envío"
                    : "ML Flex no pudo entregar",
                createdBy: "ml-cron-check",
              },
            },
          },
        });

        try {
          const { raiseAlert } = await import("@/lib/services/alert.service");
          await raiseAlert({
            type: "FLEX_CANCELLED",
            orderId: order.id,
            orderNumber: order.orderNumber,
            storeId: order.storeId,
            title: `${order.orderNumber} · Flex ${mlStatus === "cancelled" ? "canceló" : "no entregó"}`,
            detail: `Pedido marcado como ${mlStatus} por ML Flex.`,
          });
        } catch {}

        results.push({
          orderNumber: order.orderNumber,
          status: "incident",
          mlStatus,
        });
      } else {
        // Sin cambio — solo registrar mlShippedAt si tiene fecha
        if (dateShipped && !order.mlShippedAt) {
          await prisma.order.update({
            where: { id: order.id },
            data: { mlShippedAt: new Date(dateShipped) },
          });
          escaneados++;
        }
      }
    } catch (err: any) {
      console.error("[ML cron] Error:", order.orderNumber, err.message);
      errores++;
    }
  }

  console.log(
    `[ML cron] Terminado: ${orders.length} revisados, ${cerrados} cerrados, ${escaneados} escaneados, ${errores} errores`,
  );

  return NextResponse.json({
    ok: true,
    checked: orders.length,
    cerrados,
    escaneados,
    errores,
    results: results.slice(0, 50),
  });
}
