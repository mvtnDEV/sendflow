export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { batchTransitionOrders } from "@/lib/services/order-batch.service";
import {
  toEnviosNowPayload,
  createEnviosNowDelivery,
} from "@/lib/services/enviosnow.service";
import { TIENDAS_FRET_ACTIVAS } from "@/lib/config/operadores";

function verifyDriverToken(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), "base64").toString());
    if (payload.exp < Date.now()) return null;
    if (payload.role !== "DRIVER") return null;
    return payload as { id: string; name: string; storeId: string | null };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const driver = verifyDriverToken(req);
  if (!driver)
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );

  const { orderIds } = await req.json().catch(() => ({}));
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "orderIds requerido" },
      { status: 400 },
    );
  }

  let enviadosNow = 0;

  try {
    const result = await batchTransitionOrders({
      orderIds,
      toStatus: "RECEIVED",
      fromStatuses: ["PENDING", "RECEIVED", "INCIDENT", "DELIVERED"],
      eventNote: "Recepcionado en bodega vía escaneo batch",
      createdBy: driver.id,
      timestampField: "receivedAt",
    });

    // ── Enviar a Now los que no son de tiendas Fret activas ──
    const todosIds = [
      ...new Set([...result.updated.map((o) => o.id), ...orderIds]),
    ];

    const pedidosParaNow = await prisma.order.findMany({
      where: {
        id: { in: todosIds },
        storeId: { notIn: Array.from(TIENDAS_FRET_ACTIVAS) },
      },
      include: { store: { select: { name: true } } },
    });

    if (pedidosParaNow.length > 0) {
      const shippingEnviados = new Map<string, string>();

      for (const order of pedidosParaNow) {
        try {
          const shippingId = (order.rawPayload as any)?.shipping?.id;

          // ── Pack grouping ──
          if (shippingId && order.platform === "MERCADOLIBRE") {
            const key = String(shippingId);

            if (shippingEnviados.has(key)) {
              const nowId = shippingEnviados.get(key)!;
              await prisma.order.update({
                where: { id: order.id },
                data: { externalId: nowId },
              });
              console.log(
                "[driver batch-receive] Pack agrupado:",
                order.orderNumber,
                "→",
                nowId,
              );
              continue;
            }

            const packOrders = await prisma.order.findMany({
              where: {
                id: { in: todosIds },
                platform: "MERCADOLIBRE",
                rawPayload: {
                  path: ["shipping", "id"],
                  equals: Number(shippingId),
                },
              },
              select: { id: true, bultos: true },
            });
            const bultosTotal = packOrders.reduce((s, o) => s + o.bultos, 0);

            const payload = toEnviosNowPayload({
              ...order,
              bultos: bultosTotal,
            });
            const nowResult = await createEnviosNowDelivery(payload);

            if (nowResult.ok && nowResult.id && nowResult.id !== "duplicate") {
              const nowId = String(nowResult.id);
              shippingEnviados.set(key, nowId);
              enviadosNow++;

              await prisma.order.updateMany({
                where: { id: { in: packOrders.map((o) => o.id) } },
                data: { externalId: nowId },
              });
              console.log(
                "[driver batch-receive] Now pack:",
                order.orderNumber,
                "→",
                nowId,
                `(${packOrders.length} ventas, ${bultosTotal} bultos)`,
              );
            }
            continue;
          }

          // ── Pedido individual ──
          const payload = toEnviosNowPayload(order);
          const nowResult = await createEnviosNowDelivery(payload);

          if (nowResult.ok && nowResult.id && nowResult.id !== "duplicate") {
            await prisma.order.update({
              where: { id: order.id },
              data: { externalId: String(nowResult.id) },
            });
            enviadosNow++;
            console.log(
              "[driver batch-receive] Now:",
              order.orderNumber,
              "→",
              nowResult.id,
            );
          }
        } catch (err: any) {
          console.error(
            "[driver batch-receive] Error Now:",
            order.orderNumber,
            err.message,
          );
        }
      }

      console.log(
        `[driver batch-receive] Now: ${enviadosNow}/${pedidosParaNow.length} enviados`,
      );
    }

    return NextResponse.json({
      ok: true,
      updated: result.updated.length,
      enviadosNow,
    });
  } catch (err) {
    console.error("[batch-receive] Error en batch:", err);
    return NextResponse.json(
      { ok: false, error: "Error recepcionando pedidos" },
      { status: 500 },
    );
  }
}
