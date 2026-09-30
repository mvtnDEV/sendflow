export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import { refreshMLToken } from "@/lib/integrations/mercadolibre";
import { classifyFlex, closeFlexNotDelivered, FLEX_RECHECK_WHERE } from "@/lib/services/flex-close.service";

// ── Desde el 24-sep-2026 ninguna tienda nueva va a Fret. ──
// Los pedidos viejos que tienen FR- se siguen notificando a Fret
// por la condición externalId?.startsWith("FR-").
const TIENDAS_FRET = new Set<string>([]);

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

  // Corre cada 5 min sobre los últimos 7 días (antes 3), los más nuevos primero.
  // Los pedidos abiertos más antiguos (hasta 30 días) los revisa una vez al día
  // /api/cron/flex-sweep.
  const ventana = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      platform: "MERCADOLIBRE",
      ...FLEX_RECHECK_WHERE, // abiertos + cerrados por Flex (por si ML entrega después)
      sourceId: { not: null },
      createdAt: { gte: ventana },
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
    orderBy: [
      { mlShippedAt: { sort: "asc", nulls: "first" } },
      // Los más nuevos primero: son los que hay que escanear hoy. Antes iban los más
      // antiguos primero y, con la ventana de 7 días, la corrida se acababa antes de
      // llegar a los pedidos del día.
      { createdAt: "desc" },
    ],
  });

  console.log(`[ML cron] Revisando ${orders.length} pedidos ML activos`);

  const results: any[] = [];
  let cerrados = 0;
  let escaneados = 0;
  let errores = 0;

  const procesar = async (order: (typeof orders)[number]) => {
    const token = await getTokenForStore(order.storeId);
    if (!token) {
      errores++;
      return;
    }

    try {
      const shippingId = (order.rawPayload as any)?.shipping?.id;
      if (!shippingId) return;

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
        return;
      }

      const shipment = await shipRes.json();
      const mlStatus = shipment?.status;
      const mlSubstatus = shipment?.substatus ?? null;
      const dateShipped = shipment?.status_history?.date_shipped;
      // Se clasifica ANTES de mirar "shipped": un envío reprogramado sigue en
      // status "shipped" (con substatus de reprogramación).
      const outcome = classifyFlex({ shipmentStatus: mlStatus, shipmentSubstatus: mlSubstatus });

      // ── DELIVERED: cerrar pedido ──
      if (outcome === "delivered") {
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
                note:
                  order.status === "INCIDENT"
                    ? "ML Flex entregó después de reprogramar/cancelar · pasa de No entregado a Entregado"
                    : "Entrega confirmada por Moovex (respaldo Flex)",
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

        // ── CANCELADO / REPROGRAMADO / NO ENTREGADO: cerrar como no entregado ──
      } else if (outcome) {
        const closed = await closeFlexNotDelivered({
          orderId: order.id,
          outcome,
          source: "ml-cron-check",
          substatus: mlSubstatus,
        });
        if (closed) {
          cerrados++;
          results.push({ orderNumber: order.orderNumber, status: "no_entregado", mlStatus, mlSubstatus });
        }

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
  };

  // Tokens primero, uno por tienda y en orden: ML invalida el refresh token al usarlo,
  // así que no se debe renovar dos veces en paralelo.
  for (const storeId of new Set(orders.map((o) => o.storeId))) {
    await getTokenForStore(storeId);
  }

  // Lotes en paralelo para que la corrida alcance a revisar todos los pedidos.
  const LOTE = 8;
  for (let i = 0; i < orders.length; i += LOTE) {
    await Promise.all(orders.slice(i, i + LOTE).map(procesar));
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
