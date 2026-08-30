import { prisma } from '@/lib/db/prisma'
import type { AlertType, AlertStatus } from '@prisma/client'

/**
 * Alertas operativas para SUPER_ADMIN.
 *
 * Igual que audit.service.ts, todo va envuelto en try/catch que solo loguea:
 * una alerta NUNCA debe tumbar un cron ni un webhook.
 *
 * A diferencia de audit(), acá no se usa headers() de next/headers, para que
 * se pueda llamar desde cualquier contexto (cron, webhook, servicio).
 */

interface RaiseAlertParams {
  type:         AlertType
  orderId?:     string | null
  orderNumber?: string | null
  storeId?:     string | null
  title:        string
  detail?:      string | null
  metadata?:    Record<string, unknown>
}

/** Clave de deduplicación: una alerta viva por tipo + pedido. */
export function buildDedupeKey(type: AlertType, orderId?: string | null) {
  return `${type}:${orderId ?? 'global'}`
}

/**
 * Crea la alerta o, si ya existe, solo refresca lastSeenAt.
 * NUNCA reabre una alerta que ya fue resuelta a mano ni pisa la nota de quien la resolvió.
 */
export async function raiseAlert(params: RaiseAlertParams) {
  try {
    const dedupeKey = buildDedupeKey(params.type, params.orderId)

    await prisma.alert.upsert({
      where:  { dedupeKey },
      update: { lastSeenAt: new Date() },
      create: {
        type:        params.type,
        dedupeKey,
        orderId:     params.orderId     ?? null,
        orderNumber: params.orderNumber ?? null,
        storeId:     params.storeId     ?? null,
        title:       params.title,
        detail:      params.detail      ?? null,
        metadata:    params.metadata
          ? JSON.parse(JSON.stringify(params.metadata))
          : undefined,
      },
    })
  } catch (err) {
    console.error('[Alert error]', err)
  }
}

/**
 * Resuelve automáticamente las alertas ACTIVE de un tipo cuyo pedido ya no cumple
 * la condición. Sin esto el panel se llena de basura en una semana.
 */
export async function autoResolveMissing(type: AlertType, activeOrderIds: string[]) {
  try {
    const result = await prisma.alert.updateMany({
      where: {
        type,
        status:  'ACTIVE',
        orderId: { notIn: activeOrderIds.length ? activeOrderIds : ['__none__'] },
      },
      data: {
        status:     'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: 'system',
      },
    })
    return result.count
  } catch (err) {
    console.error('[Alert autoResolve error]', err)
    return 0
  }
}

interface ListAlertsFilters {
  status?:  AlertStatus
  type?:    AlertType
  storeId?: string
}

export async function listAlerts(filters: ListAlertsFilters = {}) {
  return prisma.alert.findMany({
    where: {
      ...(filters.status  && { status:  filters.status  }),
      ...(filters.type    && { type:    filters.type    }),
      ...(filters.storeId && { storeId: filters.storeId }),
    },
    orderBy: { lastSeenAt: 'desc' },
    take:    200,
  })
}

export async function resolveAlert(id: string, userId: string, note?: string | null) {
  return prisma.alert.update({
    where: { id },
    data: {
      status:       'RESOLVED',
      resolvedAt:   new Date(),
      resolvedBy:   userId,
      resolvedNote: note?.trim() || null,
    },
  })
}

export async function countActiveAlerts(): Promise<number> {
  try {
    return await prisma.alert.count({ where: { status: 'ACTIVE' } })
  } catch (err) {
    console.error('[Alert count error]', err)
    return 0
  }
}

/** Etiquetas en español chileno para el panel. */
export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  FLEX_CANCELLED:     'Flex canceló / no entregó',
  STUCK_IN_TRANSIT:   'Trabado en camino (+24 h)',
  NOT_SENT_TO_FRET:   'No enviado al operador (+2 h)',
  FRET_NOT_PICKED_UP: 'Sin retirar (+48 h)',
}

export const ALERT_TYPE_COLOR: Record<AlertType, string> = {
  FLEX_CANCELLED:     '#EF4444',
  STUCK_IN_TRANSIT:   '#F59E0B',
  NOT_SENT_TO_FRET:   '#2563EB',
  FRET_NOT_PICKED_UP: '#7C3AED',
}
