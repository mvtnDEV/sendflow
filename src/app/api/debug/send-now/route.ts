export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  toEnviosNowPayload,
  createEnviosNowDelivery,
} from "@/lib/services/enviosnow.service";

export async function POST(req: NextRequest) {
  const { orderIds } = await req.json();
  if (!Array.isArray(orderIds))
    return NextResponse.json({ error: "orderIds requerido" }, { status: 400 });

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: { store: { select: { name: true } } },
  });

  const results: any[] = [];
  const shippingEnviados = new Map<string, string>(); // shippingId → id de Now

  for (const order of orders) {
    try {
      const shippingId = (order.rawPayload as any)?.shipping?.id;

      // ── Pack ML: 1 solo envío a Now por shipping_id ──
      if (shippingId && order.platform === "MERCADOLIBRE") {
        const key = String(shippingId);

        if (shippingEnviados.has(key)) {
          const nowId = shippingEnviados.get(key)!;
          await prisma.order.update({
            where: { id: order.id },
            data: { externalId: nowId },
          });
          results.push({
            orderNumber: order.orderNumber,
            status: "pack_agrupado",
            nowId,
          });
          continue;
        }

        const packOrders = await prisma.order.findMany({
          where: {
            id: { in: orderIds },
            platform: "MERCADOLIBRE",
            rawPayload: {
              path: ["shipping", "id"],
              equals: Number(shippingId),
            },
          },
          select: { id: true },
        });

        const result = await createEnviosNowDelivery(toEnviosNowPayload(order));

        if (result.ok && result.id && result.id !== "duplicate") {
          const nowId = String(result.id);
          shippingEnviados.set(key, nowId);
          await prisma.order.updateMany({
            where: { id: { in: packOrders.map((o) => o.id) } },
            data: { externalId: nowId },
          });
          results.push({
            orderNumber: order.orderNumber,
            status: "enviado",
            nowId,
            ventasEnPack: packOrders.length,
          });
        } else if (result.id === "duplicate") {
          results.push({ orderNumber: order.orderNumber, status: "duplicado" });
        } else {
          results.push({
            orderNumber: order.orderNumber,
            status: "error",
            detail: result.error,
          });
        }
        continue;
      }

      // ── Pedido individual ──
      const result = await createEnviosNowDelivery(toEnviosNowPayload(order));
      if (result.ok && result.id && result.id !== "duplicate") {
        await prisma.order.update({
          where: { id: order.id },
          data: { externalId: String(result.id) },
        });
        results.push({
          orderNumber: order.orderNumber,
          status: "enviado",
          nowId: result.id,
        });
      } else if (result.id === "duplicate") {
        results.push({ orderNumber: order.orderNumber, status: "duplicado" });
      } else {
        results.push({
          orderNumber: order.orderNumber,
          status: "error",
          detail: result.error,
        });
      }
    } catch (err: any) {
      results.push({
        orderNumber: order.orderNumber,
        status: "error",
        detail: err.message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total: orders.length,
    enviados: results.filter((r) => r.status === "enviado").length,
    packs: results.filter((r) => r.status === "pack_agrupado").length,
    results,
  });
}
