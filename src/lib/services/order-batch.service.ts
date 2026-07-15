import { OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

// ── Transición de estado en lote: 1 findMany + updateMany + createMany en una
// transacción. Reemplaza los loops pedido-por-pedido de los endpoints batch. ──

export interface BatchTransitionInput {
  orderIds:           string[]
  toStatus:           OrderStatus
  fromStatuses:       OrderStatus[]
  eventNote:          string
  createdBy:          string
  restrictToStoreId?: string          // STORE_ADMIN: pedidos de otra tienda → error
  timestampField?:    'receivedAt' | 'inTransitAt'
  reportMissing?:     boolean         // agregar error "Pedido {id} no encontrado"
}

// Select mínimo reutilizado luego por EnviosNow (toEnviosNowPayload) y webhooks
export interface TransitionedOrder {
  id:             string
  orderNumber:    string
  storeId:        string
  previousStatus: OrderStatus
  customerName:   string
  customerPhone:  string | null
  addressStreet:  string
  addressComuna:  string
  inTransitAt:    Date | null
  createdAt:      Date
}

export interface BatchTransitionResult {
  updated: TransitionedOrder[]
  errors:  string[]
}

export async function batchTransitionOrders(input: BatchTransitionInput): Promise<BatchTransitionResult> {
  const {
    orderIds, toStatus, fromStatuses, eventNote, createdBy,
    restrictToStoreId, timestampField, reportMissing,
  } = input
  const now    = new Date()
  const errors: string[] = []

  const updated = await prisma.$transaction(async tx => {
    const orders = await tx.order.findMany({
      where:  { id: { in: orderIds } },
      select: {
        id: true, orderNumber: true, storeId: true, status: true,
        customerName: true, customerPhone: true,
        addressStreet: true, addressComuna: true,
        inTransitAt: true, createdAt: true,
      },
    })

    if (reportMissing) {
      const found = new Set(orders.map(o => o.id))
      for (const id of orderIds) {
        if (!found.has(id)) errors.push(`Pedido ${id} no encontrado`)
      }
    }

    const eligible: TransitionedOrder[] = []
    for (const order of orders) {
      if (!fromStatuses.includes(order.status)) continue // ya procesado, skip silencioso
      if (restrictToStoreId && order.storeId !== restrictToStoreId) {
        errors.push(`Sin acceso al pedido ${order.orderNumber}`)
        continue
      }
      eligible.push({ ...order, previousStatus: order.status })
    }
    if (eligible.length === 0) return eligible

    const eligibleIds = eligible.map(o => o.id)
    await tx.order.updateMany({
      where: { id: { in: eligibleIds } },
      data: {
        status: toStatus,
        ...(timestampField ? { [timestampField]: now } : {}),
      },
    })
    await tx.orderEvent.createMany({
      data: eligibleIds.map(orderId => ({
        orderId,
        status: toStatus,
        note:   eventNote,
        createdBy,
      })),
    })
    return eligible
  }, { timeout: 15_000 })

  return { updated, errors }
}
