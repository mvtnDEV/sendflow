export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const TIENDAS_FRET = new Set([
  "cmouw44ej0004thpecq6bct35", // eco pañal
  "cmouw23l60003thpe1q7f16r3", // oasis verde
  "cmpbfadyd00032vgl7klna40b", // fire master
  "cmpk7nslz0006r5e73du6f0kp", // comercial bess
  "cmovurlze000018duer7sffp4", // protec
  "cmt2181g800072mm41q6pfsb9", // sigan jugando
]);

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: {
      platform: "MERCADOLIBRE",
      status: { in: ["PENDING", "RECEIVED", "IN_TRANSIT"] },
      sourceId: { not: null },
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
    const integration = await prisma.storeIntegration.findFirst({
      where: {
        storeId: order.storeId,
        platform: "MERCADOLIBRE",
        isActive: true,
      },
    });
    const token =
      (integration as any)?.accessToken ?? (integration as any)?.apiKeyEnc;
    if (!token) continue;

    try {
      const orderId = order.sourceId!;
      const res = await fetch(
        `https://api.mercadolibre.com/orders/${orderId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;

      const mlOrder = await res.json();
      const mlStatus = mlOrder.shipping?.status ?? mlOrder.status;

      if (mlStatus === "delivered") {
        const shippingId = (order.rawPayload as any)?.shipping?.id;
        const deliveredDate =
          mlOrder.shipping?.status_history?.date_delivered ??
          new Date().toISOString();

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

        // ── Notificar a Fret si la tienda es Fret o tiene FR- ──
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

        results.push({
          orderNumber: order.orderNumber,
          status: "cerrado_por_flex",
          mlStatus,
        });
      } else {
        const esTiendaFret =
          TIENDAS_FRET.has(order.storeId) ||
          order.externalId?.startsWith("FR-");
        results.push({
          orderNumber: order.orderNumber,
          status: esTiendaFret ? "fret_en_curso" : "now_en_curso",
          mlStatus,
        });
      }
    } catch (err) {
      console.error("[ML cron] Error:", order.orderNumber, err);
    }
  }

  return NextResponse.json({ ok: true, checked: orders.length, results });
}
