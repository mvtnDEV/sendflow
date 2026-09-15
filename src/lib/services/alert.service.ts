import { prisma } from "@/lib/db/prisma";
import type { AlertType, AlertStatus } from "@prisma/client";

interface RaiseAlertParams {
  type: AlertType;
  orderId?: string | null;
  orderNumber?: string | null;
  storeId?: string | null;
  title: string;
  detail?: string | null;
  metadata?: Record<string, unknown>;
}

export const TIPOS_ACTIVOS: AlertType[] = [
  "FLEX_CANCELLED",
  "STUCK_IN_TRANSIT",
  "STUCK_RECEIVED",
  "DELIVERY_FAILED",
];

export function buildDedupeKey(type: AlertType, orderId?: string | null) {
  return `${type}:${orderId ?? "global"}`;
}

export async function raiseAlert(params: RaiseAlertParams) {
  try {
    const dedupeKey = buildDedupeKey(params.type, params.orderId);

    await prisma.alert.upsert({
      where: { dedupeKey },
      update: { lastSeenAt: new Date() },
      create: {
        type: params.type,
        dedupeKey,
        orderId: params.orderId ?? null,
        orderNumber: params.orderNumber ?? null,
        storeId: params.storeId ?? null,
        title: params.title,
        detail: params.detail ?? null,
        metadata: params.metadata
          ? JSON.parse(JSON.stringify(params.metadata))
          : undefined,
      },
    });
  } catch (err) {
    console.error("[Alert error]", err);
  }
}

export async function autoResolveMissing(
  type: AlertType,
  activeOrderIds: string[],
) {
  try {
    const result = await prisma.alert.updateMany({
      where: {
        type,
        status: "ACTIVE",
        orderId: {
          notIn: activeOrderIds.length ? activeOrderIds : ["__none__"],
        },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedBy: "system",
      },
    });
    return result.count;
  } catch (err) {
    console.error("[Alert autoResolve error]", err);
    return 0;
  }
}

interface ListAlertsFilters {
  status?: AlertStatus;
  type?: AlertType;
  storeId?: string;
}

export async function listAlerts(filters: ListAlertsFilters = {}) {
  return prisma.alert.findMany({
    where: {
      type:
        filters.type && TIPOS_ACTIVOS.includes(filters.type)
          ? filters.type
          : { in: TIPOS_ACTIVOS },
      ...(filters.status && { status: filters.status }),
      ...(filters.storeId && { storeId: filters.storeId }),
    },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
  });
}

export async function resolveAlert(
  id: string,
  userId: string,
  note?: string | null,
) {
  return prisma.alert.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedBy: userId,
      resolvedNote: note?.trim() || null,
    },
  });
}

export async function countActiveAlerts(): Promise<number> {
  try {
    return await prisma.alert.count({
      where: { status: "ACTIVE", type: { in: TIPOS_ACTIVOS } },
    });
  } catch (err) {
    console.error("[Alert count error]", err);
    return 0;
  }
}

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  FLEX_CANCELLED: "Flex canceló",
  STUCK_IN_TRANSIT: "Aún en camino (+24 h)",
  STUCK_RECEIVED: "Recepcionado sin avanzar (+12 h)",
  DELIVERY_FAILED: "No entregado",
  NOT_SENT_TO_FRET: "No enviado al operador",
  FRET_NOT_PICKED_UP: "Sin retirar",
};
