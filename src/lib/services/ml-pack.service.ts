import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { idsPorShippingId } from "@/lib/db/ml-shipping";

// ── Packs de Mercado Libre ───────────────────────────────────────────────────
// Una compra de varios productos llega como 2..N órdenes de ML (cada una con su
// sourceId) que comparten el mismo envío (shipping.id). Antes se creaba un pedido
// por orden; ahora la primera crea el pedido y las demás SE SUMAN a él:
//   · bultos += bultos de la orden
//   · rawPayload.pack_orders guarda { sourceId, bultos, items } de cada orden extra
// Está detrás del interruptor ML_AGRUPAR_PACKS=1 (apagado por defecto).

export const agruparPacksActivo = () => process.env.ML_AGRUPAR_PACKS === "1";

export interface PackOrden {
  sourceId: string;
  bultos: number;
  items: { title: string; quantity: number }[];
  cancelada?: boolean;
}

export interface PedidoPack {
  id: string;
  orderNumber: string;
  status: string;
  sourceId: string | null;
  bultos: number;
  packOrders: PackOrden[];
}

// Pedidos de la tienda que comparten el envío, el más antiguo primero.
export async function pedidosDelEnvio(
  shippingId: string | number,
  storeId: string,
): Promise<PedidoPack[]> {
  const ids = await idsPorShippingId(shippingId, { storeId });
  if (ids.length === 0) return [];
  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      sourceId: true,
      bultos: true,
      rawPayload: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    status: r.status,
    sourceId: r.sourceId,
    bultos: r.bultos,
    packOrders: Array.isArray((r.rawPayload as any)?.pack_orders)
      ? ((r.rawPayload as any).pack_orders as PackOrden[])
      : [],
  }));
}

// ¿A qué pedido ya existente pertenece esta orden de ML (como principal o extra)?
export function pedidoQueContiene(
  pedidos: PedidoPack[],
  orderId: string,
): { pedido: PedidoPack; esExtra: boolean } | null {
  for (const p of pedidos) {
    if (p.sourceId === orderId) return { pedido: p, esExtra: false };
    if (p.packOrders.some((o) => o.sourceId === orderId))
      return { pedido: p, esExtra: true };
  }
  return null;
}

// Pedido abierto al que sumar una orden nueva del mismo envío.
export function pedidoParaSumar(pedidos: PedidoPack[]): PedidoPack | null {
  return (
    pedidos.find((p) => p.status !== "DELIVERED" && p.status !== "CANCELLED") ??
    null
  );
}

// Suma la orden al pedido de forma atómica e idempotente (un solo UPDATE: si dos
// webhooks del mismo pack llegan a la vez, las filas se serializan y la segunda
// ve la lista ya actualizada). Devuelve true si efectivamente la sumó.
export async function sumarOrdenAlPack(
  pedidoId: string,
  orden: PackOrden,
): Promise<boolean> {
  const entrada = JSON.stringify(orden);
  const sonda = JSON.stringify([{ sourceId: orden.sourceId }]);
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE orders
    SET bultos = bultos + ${orden.bultos},
        "rawPayload" = jsonb_set(
          COALESCE("rawPayload", '{}'::jsonb),
          '{pack_orders}',
          COALESCE("rawPayload"->'pack_orders', '[]'::jsonb) || ${entrada}::jsonb
        ),
        "updatedAt" = now()
    WHERE id = ${pedidoId}
      AND COALESCE("sourceId", '') <> ${orden.sourceId}
      AND NOT (COALESCE("rawPayload"->'pack_orders', '[]'::jsonb) @> ${sonda}::jsonb)`);
  if (n > 0) {
    const p = await prisma.order.findUnique({
      where: { id: pedidoId },
      select: { status: true },
    });
    await prisma.orderEvent.create({
      data: {
        orderId: pedidoId,
        status: p?.status ?? "PENDING",
        note: `Pack ML: se sumó la orden ${orden.sourceId} (+${orden.bultos} bulto${orden.bultos !== 1 ? "s" : ""})`,
        createdBy: "ml-webhook",
      },
    });
  }
  return n > 0;
}

// Una orden extra del pack se canceló: restar sus bultos sin cancelar el paquete.
export async function quitarOrdenDelPack(
  pedidoId: string,
  sourceId: string,
): Promise<boolean> {
  const pedidos = await prisma.order.findUnique({
    where: { id: pedidoId },
    select: { rawPayload: true, status: true },
  });
  const lista: PackOrden[] = Array.isArray((pedidos?.rawPayload as any)?.pack_orders)
    ? (pedidos!.rawPayload as any).pack_orders
    : [];
  const orden = lista.find((o) => o.sourceId === sourceId);
  if (!orden || orden.cancelada) return false;

  // Marca como cancelada solo si aún no lo estaba (evita restar dos veces)
  const sonda = JSON.stringify([{ sourceId, cancelada: true }]);
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE orders
    SET bultos = GREATEST(1, bultos - ${orden.bultos}),
        "rawPayload" = jsonb_set(
          "rawPayload",
          '{pack_orders}',
          (SELECT jsonb_agg(
             CASE WHEN e->>'sourceId' = ${sourceId}
                  THEN e || '{"cancelada": true}'::jsonb ELSE e END)
           FROM jsonb_array_elements("rawPayload"->'pack_orders') e)
        ),
        "updatedAt" = now()
    WHERE id = ${pedidoId}
      AND NOT ("rawPayload"->'pack_orders' @> ${sonda}::jsonb)`);
  if (n > 0) {
    await prisma.orderEvent.create({
      data: {
        orderId: pedidoId,
        status: pedidos?.status ?? "PENDING",
        note: `Pack ML: se canceló la orden ${sourceId} (-${orden.bultos} bulto${orden.bultos !== 1 ? "s" : ""})`,
        createdBy: "ml-webhook",
      },
    });
  }
  return n > 0;
}
