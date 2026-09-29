export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkMLShipmentStatus } from "@/lib/integrations/mercadolibre-status";
import { classifyFlex, closeFlexNotDelivered, FLEX_RECHECK_WHERE, OPEN_STATUSES } from "@/lib/services/flex-close.service";

const DIA = 24 * 60 * 60 * 1000;
const MAX_POR_CORRIDA = 300;

/**
 * GET /api/cron/flex-sweep — una vez al día (ver vercel.json).
 *
 * Revisa contra ML los pedidos Flex abiertos (o cerrados por Flex como no entregados)
 * que tienen entre 7 y 30 días (los más recientes los cubre check-ml-shipped cada
 * 5 min). Cierra como
 * "No entregado" los que ML canceló o reprogramó, y como entregados los que ML
 * ya entregó (también si antes se habían cerrado como no entregados). La primera
 * corrida sirve también para sanear lo que quedó abierto.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Falla cerrado: sin CRON_SECRET configurado no se ejecuta.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ahora = Date.now();
  const pedidos = await prisma.order.findMany({
    where: {
      platform: "MERCADOLIBRE",
      ...FLEX_RECHECK_WHERE,
      sourceId: { not: null },
      createdAt: { gte: new Date(ahora - 30 * DIA), lt: new Date(ahora - 7 * DIA) },
    },
    select: { id: true, orderNumber: true, status: true },
    orderBy: { createdAt: "asc" },
    take: MAX_POR_CORRIDA,
  });

  const resumen = { revisados: pedidos.length, noEntregados: 0, entregados: 0, sinCambio: 0, sinRespuesta: 0 };
  const detalle: { orderNumber: string; resultado: string; status: string | null; substatus: string | null }[] = [];

  for (const p of pedidos) {
    try {
      const ml = await checkMLShipmentStatus(p.id);
      if (!ml) {
        resumen.sinRespuesta++;
        continue;
      }
      const outcome = classifyFlex({ shipmentStatus: ml.shipmentStatus, shipmentSubstatus: ml.shipmentSubstatus });

      if (outcome === "delivered") {
        const res = await prisma.order.updateMany({
          where: { id: p.id, status: { in: [...OPEN_STATUSES, "INCIDENT"] } },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
        if (res.count) {
          const note =
            p.status === "INCIDENT"
              ? "ML Flex entregó después de reprogramar/cancelar · pasa de No entregado a Entregado (revisión diaria)"
              : "Entrega confirmada por ML Flex (revisión diaria)";
          await prisma.orderEvent.create({
            data: { orderId: p.id, status: "DELIVERED", note, createdBy: "ml-sweep" },
          });
          const { notifyWebhooks } = await import("@/lib/services/webhook.service");
          await notifyWebhooks(p.id, "DELIVERED", p.status).catch(() => {});
          resumen.entregados++;
          detalle.push({ orderNumber: p.orderNumber, resultado: "entregado", status: ml.shipmentStatus, substatus: ml.shipmentSubstatus });
        }
      } else if (outcome) {
        const closed = await closeFlexNotDelivered({ orderId: p.id, outcome, source: "ml-sweep", substatus: ml.shipmentSubstatus });
        if (closed) {
          resumen.noEntregados++;
          detalle.push({ orderNumber: p.orderNumber, resultado: `no_entregado:${outcome}`, status: ml.shipmentStatus, substatus: ml.shipmentSubstatus });
        }
      } else {
        resumen.sinCambio++;
      }
    } catch (err) {
      console.error("[Flex sweep] Error en", p.orderNumber, err);
      resumen.sinRespuesta++;
    }
  }

  console.log("[Flex sweep]", JSON.stringify(resumen));
  return NextResponse.json({ ok: true, resumen, detalle: detalle.slice(0, 100) });
}
