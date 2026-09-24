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

    // ── Todo lo escaneado que NO sea de tiendas Fret activas va a Now (tenga FR- o no) ──
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

    const shippingEnviados = new Map<string, string>();

    for (const order of pedidosParaNow) {
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
            select: { id: true },
          });

          const nowResult = await createEnviosNowDelivery(
            toEnviosNowPayload(order),
          );

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
              `(${packOrders.length} ventas)`,
            );
          } else if (!nowResult.ok) {
            console.warn(
              "[driver batch-receive] Now rechazó:",
              order.orderNumber,
              nowResult.error,
            );
          }
          continue;
        }

        // ── Pedido individual ──
        const nowResult = await createEnviosNowDelivery(
          toEnviosNowPayload(order),
        );
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
        } else if (!nowResult.ok) {
          console.warn(
            "[driver batch-receive] Now rechazó:",
            order.orderNumber,
            nowResult.error,
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
      `[driver batch-receive] Now: ${enviadosNow} envíos creados de ${pedidosParaNow.length} pedidos`,
    );

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
