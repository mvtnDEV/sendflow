import { prisma } from '@/lib/db/prisma'
import { generateOrderNumber, ensureUniqueQrCode } from '@/lib/utils/order-number'
import type { OrderFilters, NormalizedOrder, DashboardStats } from '@/types'
import type { OrderStatus, Platform } from '@prisma/client'

// ─── Crear pedido (manual o desde integración) ────────────────────────────────

interface CreateOrderInput {
  storeId:        string
  integrationId?: string
  platform:       Platform
  customerName:   string
  customerPhone?: string
  customerEmail?: string
  addressStreet:  string
  addressComuna:  string
  addressRegion:  string
  addressNotes?:  string
  bultos:         number
  weightKg?:      number
  externalId?:    string
  rawPayload?:    Record<string, unknown>
  createdBy?:     string
}

export async function createOrder(input: CreateOrderInput) {
  const [orderNumber, qrCode] = await Promise.all([
    generateOrderNumber(input.platform),
    ensureUniqueQrCode(input.platform),
  ])

  const order = await prisma.order.create({
    data: {
      orderNumber,
      qrCode,
      storeId:       input.storeId,
      integrationId: input.integrationId,
      platform:      input.platform,
      externalId:    input.externalId,
      customerName:  input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail,
      addressStreet: input.addressStreet,
      addressComuna: input.addressComuna,
      addressRegion: input.addressRegion,
      addressNotes:  input.addressNotes,
      bultos:        input.bultos,
      weightKg:      input.weightKg,
      rawPayload:    input.rawPayload as any,
      status:        'PENDING',
      events: {
        create: {
          status:    'PENDING',
          note:      'Pedido creado',
          createdBy: input.createdBy ?? 'system',
        },
      },
    },
    include: { store: true, events: true },
  })

// Enviar automáticamente a Envios Now y guardar su ID
export async function updateOrderStatus(
  orderId:    string,
  status:     OrderStatus,
  note?:      string,
  createdBy?: string,
) {
  const timestampField = STATUS_TIMESTAMP[status]
  const now = new Date()

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(timestampField ? { [timestampField]: now } : {}),
      events: {
        create: {
          status,
          note:      note ?? `Estado actualizado a ${status}`,
          createdBy: createdBy ?? 'system',
        },
      },
    },
    include: { store: true, events: { orderBy: { createdAt: 'desc' } } },
  })

  if (status === 'RECEIVED') {
    try {
      const { toEnviosNowPayload, createEnviosNowDelivery } = await import('./enviosnow.service')
      const payload = toEnviosNowPayload(order)
      const result  = await createEnviosNowDelivery(payload)
      if (!result.ok) {
        console.warn('[EnviosNow] No se pudo crear el envío:', result.error)
      } else if (result.id && result.id !== 'duplicate') {
        await prisma.order.update({
          where: { id: order.id },
          data:  { externalId: String(result.id) },
        })
        console.log('[EnviosNow] Envío creado al recepcionar, ID:', result.id)
      }
    } catch (err) {
      console.error('[EnviosNow] Error enviando pedido:', err)
    }
  }

  return order
}

  return order
}

// ─── Upsert desde webhook (idempotente) ───────────────────────────────────────

export async function upsertOrderFromWebhook(
  storeId:       string,
  integrationId: string,
  data:          NormalizedOrder,
) {
  const existing = await prisma.order.findFirst({
    where: { integrationId, externalId: data.externalId },
  })

  if (existing) {
    return prisma.order.update({
      where: { id: existing.id },
      data: {
        customerName:  data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        addressStreet: data.addressStreet,
        addressComuna: data.addressComuna,
        addressRegion: data.addressRegion,
        rawPayload:    data.rawPayload as any,
      },
    })
  }

  return createOrder({
    storeId,
    integrationId,
    platform:      data.platform,
    externalId:    data.externalId,
    customerName:  data.customerName,
    customerPhone: data.customerPhone,
    customerEmail: data.customerEmail,
    addressStreet: data.addressStreet,
    addressComuna: data.addressComuna,
    addressRegion: data.addressRegion,
    bultos:        data.bultos,
    rawPayload:    data.rawPayload as any,
    createdBy:     'webhook',
  })
}

// ─── Cambiar estado de un pedido ──────────────────────────────────────────────

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  RECEIVED:   'receivedAt',
  IN_TRANSIT: 'inTransitAt',
  DELIVERED:  'deliveredAt',
}

export async function updateOrderStatus(
  orderId:    string,
  status:     OrderStatus,
  note?:      string,
  createdBy?: string,
) {
  const timestampField = STATUS_TIMESTAMP[status]
  const now = new Date()

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(timestampField ? { [timestampField]: now } : {}),
      events: {
        create: {
          status,
          note:      note ?? `Estado actualizado a ${status}`,
          createdBy: createdBy ?? 'system',
        },
      },
    },
    include: { store: true, events: { orderBy: { createdAt: 'desc' } } },
  })

  return order
}

// ─── Buscar por QR ────────────────────────────────────────────────────────────

export async function findOrderByQr(qrCode: string) {
  return prisma.order.findUnique({
    where: { qrCode },
    include: {
      store:  { select: { id: true, name: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
}

// ─── Listar pedidos con filtros ───────────────────────────────────────────────

export async function listOrders(filters: OrderFilters) {
  const page     = filters.page     ?? 1
  const pageSize = filters.pageSize ?? 10
  const skip     = (page - 1) * pageSize

  const where: any = {}

  if (filters.storeId)  where.storeId  = filters.storeId
  if (filters.status)   where.status   = filters.status
  if (filters.platform) where.platform = filters.platform
  if (filters.comuna)   where.addressComuna = { contains: filters.comuna, mode: 'insensitive' }

  if (filters.search) {
    where.OR = [
      { customerName:  { contains: filters.search, mode: 'insensitive' } },
      { addressStreet: { contains: filters.search, mode: 'insensitive' } },
      { orderNumber:   { contains: filters.search, mode: 'insensitive' } },
      { customerPhone: { contains: filters.search } },
    ]
  }

  if (filters.todayOnly && !filters.dateFrom && !filters.dateTo) {
  where.createdAt = todayRange()
} else if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
      ...(filters.dateTo   && { lte: new Date(filters.dateTo + 'T23:59:59') }),
    }
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take:    pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        store:       { select: { id: true, name: true, slug: true } },
        integration: { select: { platform: true } },
        events:      { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.order.count({ where }),
  ])

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

// ─── Stats para el dashboard ──────────────────────────────────────────────────

function todayRange() {
  // Chile es UTC-3 (invierno) / UTC-4 (verano)
  // Calculamos el inicio y fin del día en Santiago
  const now = new Date()
  
  // Obtener fecha actual en Santiago
  const santiagoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  
  const year  = santiagoParts.find(p => p.type === 'year')!.value
  const month = santiagoParts.find(p => p.type === 'month')!.value
  const day   = santiagoParts.find(p => p.type === 'day')!.value

  // Crear inicio y fin del día en Santiago como UTC
  const startSantiago = new Date(`${year}-${month}-${day}T00:00:00-03:00`)
  const endSantiago   = new Date(`${year}-${month}-${day}T23:59:59-03:00`)

  return { gte: startSantiago, lte: endSantiago }
}

export async function getDashboardStats(storeId?: string, todayOnly = true): Promise<DashboardStats> {
  const where: any = {}
  if (storeId)   where.storeId   = storeId
  if (todayOnly) where.createdAt = todayRange()

  const [counts, byPlatform, byStore] = await Promise.all([
    prisma.order.groupBy({ by:['status'], where, _count:{ _all:true } }),
    prisma.order.groupBy({ by:['platform'], where, _count:{ _all:true } }),
    storeId ? [] : prisma.order.groupBy({
      by: ['storeId'], where, _count:{ _all:true },
      orderBy: { _count: { storeId: 'desc' } }, take: 5,
    }),
  ])

  const countMap: Record<string, number> = {}
  counts.forEach(c => { countMap[c.status] = c._count._all })
  const total = Object.values(countMap).reduce((a,b) => a+b, 0)

  let byStoreWithNames: DashboardStats['byStore'] = []
  if (!storeId && byStore.length > 0) {
    const stores = await prisma.store.findMany({
      where:  { id: { in: (byStore as any[]).map((s:any) => s.storeId) } },
      select: { id:true, name:true },
    })
    const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]))
    byStoreWithNames = (byStore as any[]).map((s:any) => ({
      storeId:   s.storeId,
      storeName: storeMap[s.storeId] ?? 'Desconocida',
      count:     s._count._all,
    }))
  }

  return {
    total,
    pending:    countMap['PENDING']    ?? 0,
    received:   countMap['RECEIVED']   ?? 0,
    inTransit:  countMap['IN_TRANSIT'] ?? 0,
    delivered:  countMap['DELIVERED']  ?? 0,
    incident:   countMap['INCIDENT']   ?? 0,
    byPlatform: byPlatform.map(p => ({ platform:p.platform, count:p._count._all })),
    byStore:    byStoreWithNames,
  }
}
