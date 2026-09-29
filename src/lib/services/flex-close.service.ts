import { prisma } from "@/lib/db/prisma";
import { OrderStatus, Prisma } from "@prisma/client";

/*
 * Cierre de pedidos Flex que Mercado Libre no entregará.
 *
 * Regla del negocio (28-09-2026): si ML Flex CANCELA o REPROGRAMA un envío,
 * ESE MISMO pedido se cierra como "No entregado" (INCIDENT). "Cancelado"
 * (CANCELLED) queda reservado para cancelaciones de Moovex o de la tienda.
 *
 * Lo usan los 3 caminos por donde llega el estado de ML: el webhook
 * (webhooks/mercadolibre), check-ml-shipped y check-ml-pending, para que
 * los tres cierren igual: evento, alerta y aviso por webhook a la tienda.
 */

export type FlexOutcome = "delivered" | "cancelled" | "rescheduled" | "not_delivered";

/** Estados en que el pedido sigue abierto y todavía se puede cerrar. */
export const OPEN_STATUSES: OrderStatus[] = ["PENDING", "RECEIVED", "DISPATCHED", "PICKED_UP", "IN_TRANSIT"];

const FLEX_CLOSE_SOURCES = ["ml-webhook", "ml-cron-check", "ml-sweep"];

/**
 * Pedidos que siguen revisándose contra ML: los abiertos y los que cerró Flex como
 * "No entregado". Si ML después sí entrega (p. ej. tras reprogramar), pasan a
 * DELIVERED. Las incidencias marcadas a mano no entran: no tienen evento de ML.
 */
export const FLEX_RECHECK_WHERE: Prisma.OrderWhereInput = {
  OR: [
    { status: { in: OPEN_STATUSES } },
    {
      status: "INCIDENT",
      events: { some: { status: "INCIDENT", createdBy: { in: FLEX_CLOSE_SOURCES } } },
    },
  ],
};

/**
 * Interpreta el estado del envío (y de la orden) de ML.
 * "Reprogramado": ML usa varias variantes (rescheduled_by_meli, buyer_rescheduled…),
 * por eso se reconoce cualquier subestado que contenga "reschedul".
 */
export function classifyFlex(input: {
  shipmentStatus?: string | null;
  shipmentSubstatus?: string | null;
  orderStatus?: string | null;
}): FlexOutcome | null {
  const status = (input.shipmentStatus ?? "").toLowerCase();
  const sub = (input.shipmentSubstatus ?? "").toLowerCase();
  const order = (input.orderStatus ?? "").toLowerCase();

  if (status === "delivered") return "delivered";
  if (status === "cancelled" || sub === "cancelled" || order === "cancelled") return "cancelled";
  if (sub.includes("reschedul")) return "rescheduled";
  if (status === "not_delivered") return "not_delivered";
  return null;
}

type NotDelivered = Exclude<FlexOutcome, "delivered">;

const NOTE: Record<NotDelivered, string> = {
  cancelled: "ML Flex canceló el envío · se cierra como no entregado",
  rescheduled: "ML Flex reprogramó la entrega · se cierra como no entregado",
  not_delivered: "ML Flex no pudo entregar",
};

const VERB: Record<NotDelivered, string> = {
  cancelled: "canceló",
  rescheduled: "reprogramó",
  not_delivered: "no entregó",
};

/**
 * Cierra el pedido como INCIDENT ("No entregado"). Idempotente: si el pedido ya
 * no está abierto (entregado, cancelado o ya en incidencia) no hace nada.
 * Devuelve true si efectivamente lo cerró.
 */
export async function closeFlexNotDelivered(params: {
  orderId: string;
  outcome: NotDelivered;
  source: "ml-webhook" | "ml-cron-check" | "ml-sweep";
  substatus?: string | null;
}): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, orderNumber: true, storeId: true, status: true },
  });
  if (!order || !OPEN_STATUSES.includes(order.status)) return false;

  const note = params.substatus ? `${NOTE[params.outcome]} (${params.substatus})` : NOTE[params.outcome];

  // updateMany con filtro de estado: si otro proceso lo cerró entre medio, no se pisa.
  const closed = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: order.id, status: { in: OPEN_STATUSES } },
      data: { status: "INCIDENT", pendingNowEvidence: Prisma.JsonNull, pendingNowCheckedAt: new Date() },
    });
    if (res.count === 0) return false;
    await tx.orderEvent.create({
      data: { orderId: order.id, status: "INCIDENT", note, createdBy: params.source },
    });
    return true;
  });
  if (!closed) return false;

  console.log(`[Flex] ${order.orderNumber} cerrado como no entregado · ${params.outcome} · ${params.source}`);

  try {
    const { raiseAlert } = await import("@/lib/services/alert.service");
    await raiseAlert({
      type: "FLEX_CANCELLED",
      orderId: order.id,
      orderNumber: order.orderNumber,
      storeId: order.storeId,
      title: `${order.orderNumber} · Flex ${VERB[params.outcome]}`,
      detail: `${note}.`,
      metadata: { outcome: params.outcome, substatus: params.substatus ?? null, source: params.source },
    });
  } catch (err) {
    console.error("[Flex] No se pudo levantar la alerta:", order.orderNumber, err);
  }

  try {
    const { notifyWebhooks } = await import("@/lib/services/webhook.service");
    await notifyWebhooks(order.id, "INCIDENT", order.status);
  } catch (err) {
    console.error("[Flex] No se pudo notificar por webhook:", order.orderNumber, err);
  }

  return true;
}
