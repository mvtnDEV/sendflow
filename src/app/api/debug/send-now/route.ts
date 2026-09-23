export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createEnviosNowDelivery } from "@/lib/services/enviosnow.service";

export async function POST(req: NextRequest) {
  const { orderIds } = await req.json();
  if (!Array.isArray(orderIds))
    return NextResponse.json({ error: "orderIds requerido" }, { status: 400 });

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: { store: { select: { name: true } } },
  });

  const results: any[] = [];

  for (const order of orders) {
    try {
      const result = await createEnviosNowDelivery(order);
      if (result?.externalId) {
        await prisma.order.update({
          where: { id: order.id },
          data: { externalId: result.externalId },
        });
        results.push({
          orderNumber: order.orderNumber,
          status: "enviado",
          nowId: result.externalId,
        });
      } else {
        results.push({
          orderNumber: order.orderNumber,
          status: "error",
          detail: result,
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
    results,
  });
}
