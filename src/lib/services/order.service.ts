import { prisma } from '@/lib/db/prisma'
import { generateOrderNumber, ensureUniqueQrCode } from '@/lib/utils/order-number'
import type { OrderFilters, NormalizedOrder, DashboardStats } from '@/types'
import type { OrderStatus, Platform } from '@prisma/client'

const REGIONES_PERMITIDAS = [
  'metropolitana', 'región metropolitana', 'region metropolitana',
  'rm', 'metropolitana de santiago',
]

function isRegionPermitida(region: string): boolean {
  const r = region.toLowerCase().trim()
  return REGIONES_PERMITIDAS.some(allowed => r.includes(allowed) || allowed.includes(r))
}

function todayRange() {
  const now = new Date()
  const santiagoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const year  = santiagoParts.find(p => p.type === 'year')!.value
  const month = santiagoParts.find(p => p.type === 'month')!.value
  const day   = santiagoParts.find(p => p.type === 'day')!.value
  const utcDate      = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const santiagoDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const offsetMs     = santiagoDate.getTime() - utcDate.getTime()
  const offsetHours  = offsetMs / (1000 * 60 * 60)
  const sign         = offsetHours >= 0 ? '+' : '-'
  const absHours     = Math.abs(offsetHours)
  const offsetStr    = `${sign}${String(Math.floor(absHours)).padStart(2, '0')}:00`
  return {
    gte: new Date(`${year}-${month}-${day}T00:00:00${offsetStr}`),
    lte: new Date(`${year}-${month}-${day}T23:59:59${offsetStr}`),
  }
}

const CREADORES_AUTOMATICOS = ['system', 'webhook', 'ml-webhook', 'enviosnow-webhook', 'api', 'ml-cron-check']

const ESCANEADO_POR_APP = {
  events: {
    some: {
      status: 'RECEIVED' as const,
      createdBy: { notIn: CREADORES_AUTOMATICOS },
    },
  },
}

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
  sourceId?:      string
  subStoreName?:  string
  rawPayload?:    Record<string, unknown>
  createdBy?:     string
}

export async function createOrder(input: CreateOrderInput) {
  if (!isRegionPermitida(input.addressRegion)) {
    throw new Error(`Pedido fuera de zona de despacho: ${input.addressRegion}. Solo despachamos en la Región Metropolitana.`)
  }
  const [orderNumber, qrCode] = await Promise.all([
    generateOrderNumber(input.platform),
    ensureUniqueQrCode(input.platform),
  ])
  return prisma.order.create({
    data: {
      orderNumber,
      qrCode,
      storeId:       input.storeId,
      integrationId: input.integrationId,
      platform:      input.platform,
      sourceId:      input.sourceId,
      subStoreName:  input.subStoreName,
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
}

export async function upsertOrderFromWebhook(
  storeId:       string,
  integrationId: string,
  data:          NormalizedOrder,
) {
  const existing = await prisma.order.findFirst({
    where:  { integrationId, sourceId: data.externalId },
    select: { id: true },
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
    sourceId:      data.externalId,
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

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  RECEIVED:   'receivedAt',
  IN_TRANSIT: 'inTransitAt',
  DELIVERED:  'deliveredAt',
}

export async function updateOrderStatus(
  orderId:        string,
  status:         OrderStatus,
  note?:          string,
  createdBy?:     string,
  skipEnviosNow?: boolean,
) {
  const timestampField = STATUS_TIMESTAMP[status]
  const previous = await prisma.order.findUnique({
    where:  { id: orderId },
    select: { status: true },
  })
  const previousStatus = previous?.status ?? 'PENDING'
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
      events: {
        create: {
          status,
          note:      note ?? `Estado actualizado a ${status}`,
          createdBy: createdBy ?? 'system',
        },
      },
    },
  })

  if (status === 'RECEIVED' && !skipEnviosNow) {
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
      }
    } catch (err) {
      console.error('[EnviosNow] Error enviando pedido:', err)
    }
  }

  try {
    // ── Webhook en segundo plano: no bloquea la respuesta si el destino está lento ──
    const { notifyWebhooks } = await import('./webhook.service')
    const { deferAfterResponse } = await import('@/lib/utils/defer')
    deferAfterResponse(notifyWebhooks(orderId, status, previousStatus), 'updateOrderStatus webhook')
  } catch (err) {
    console.error('[Webhook] Error:', err)
  }

  return order
}

export async function findOrderByQr(qrCode: string) {
  return prisma.order.findUnique({
    where:   { qrCode },
    include: {
      store:  { select: { id: true, name: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function listOrders(filters: OrderFilters) {
  const page     = filters.page     ?? 1
  const pageSize = filters.pageSize ?? 10
  const skip     = (page - 1) * pageSize
  const today    = todayRange()
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
      { sourceId:      { contains: filters.search } },
      { subStoreName:  { contains: filters.search, mode: 'insensitive' } },
    ]
  }

  // ── Si hay búsqueda activa, no aplicar filtro de escaneo ──
  // Permite encontrar cualquier pedido al buscar por número, cliente o dirección
  // En vista normal sigue mostrando solo pedidos escaneados por la app
  const condicionesAdicionales: any[] = filters.search ? [] : [
    {
      OR: [
        { status: 'PENDING' },
        ESCANEADO_POR_APP,
      ],
    },
  ]

  if (filters.todayOnly && !filters.dateFrom && !filters.dateTo) {
    if (filters.superAdminView) {
      where.AND = [
        {
          OR: [
            { inTransitAt: today },
            { status: 'IN_TRANSIT' },
            { deliveredAt: today },
            { status: 'INCIDENT', inTransitAt: today },
          ],
        },
        {
          NOT: {
            AND: [
              { platform: 'WOOCOMMERCE' },
              { NOT: { rawPayload: { path: ['status'], equals: 'enviado_intralog' } } },
            ],
          },
        },
        ...condicionesAdicionales,
      ]
    } else {
      where.AND = [
        {
          OR: [
            { inTransitAt: today },
            { deliveredAt: today },
            { status: 'PENDING', createdAt: today },
            { status: 'INCIDENT', inTransitAt: today },
          ],
        },
        ...condicionesAdicionales,
      ]
    }
  } else if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
      ...(filters.dateTo   && { lte: new Date(filters.dateTo + 'T23:59:59') }),
    }
    if (filters.superAdminView && !filters.status) {
      where.AND = [
        { NOT: { AND: [{ status: 'PENDING' }, { NOT: { platform: 'MANUAL' } }] } },
        { NOT: { status: 'RECEIVED' } },
        { NOT: { AND: [{ platform: 'WOOCOMMERCE' }, { NOT: { rawPayload: { path: ['status'], equals: 'enviado_intralog' } } }] } },
        ...condicionesAdicionales,
      ]
    } else {
      where.AND = [...condicionesAdicionales]
    }
  } else if (filters.superAdminView && !filters.status) {
    where.AND = [
      { NOT: { AND: [{ status: 'PENDING' }, { NOT: { platform: 'MANUAL' } }] } },
      { NOT: { status: 'RECEIVED' } },
      { NOT: { AND: [{ platform: 'WOOCOMMERCE' }, { NOT: { rawPayload: { path: ['status'], equals: 'enviado_intralog' } } }] } },
      ...condicionesAdicionales,
    ]
  } else if (filters.superAdminView) {
    where.AND = [
      { NOT: { AND: [{ platform: 'WOOCOMMERCE' }, { NOT: { rawPayload: { path: ['status'], equals: 'enviado_intralog' } } }] } },
      ...condicionesAdicionales,
    ]
  } else {
    where.AND = [...condicionesAdicionales]
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take:    pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id:             true,
        orderNumber:    true,
        platform:       true,
        status:         true,
        customerName:   true,
        customerPhone:  true,
        addressStreet:  true,
        addressComuna:  true,
        bultos:         true,
        sourceId:       true,
        subStoreName:   true,
        createdAt:      true,
        evidencePhoto1: true,
        labelUrl:       true,
        mlShippedAt:    true,
        rawPayload:     true,
        store: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

export async function getDashboardStats(storeId?: string, todayOnly = true): Promise<DashboardStats> {
  const today = todayRange()
  const baseWhere: any = {}
  if (storeId) baseWhere.storeId = storeId

  if (todayOnly) {
    baseWhere.AND = [
      {
        OR: [
          { inTransitAt: today },
          { deliveredAt: today },
          { status: 'IN_TRANSIT' },
        ],
      },
      {
        OR: [
          { status: 'PENDING' },
          ESCANEADO_POR_APP,
        ],
      },
    ]
  } else {
    baseWhere.OR = [
      { status: 'PENDING' },
      ESCANEADO_POR_APP,
    ]
  }

  const [byStatus, byPlatform, byStore] = await Promise.all([
    prisma.order.groupBy({
      by:     ['status'],
      where:  baseWhere,
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by:     ['platform'],
      where:  baseWhere,
      _count: { _all: true },
    }),
    storeId ? [] : prisma.order.groupBy({
      by:      ['storeId'],
      where:   baseWhere,
      _count:  { _all: true },
      orderBy: { _count: { storeId: 'desc' } },
      take:    5,
    }),
  ])

  const countMap: Record<string, number> = {}
  byStatus.forEach(s => { countMap[s.status] = s._count._all })
  const total = Object.values(countMap).reduce((a, b) => a + b, 0)

  let byStoreWithNames: DashboardStats['byStore'] = []
  if (!storeId && byStore.length > 0) {
    const stores = await prisma.store.findMany({
      where:  { id: { in: (byStore as any[]).map((s: any) => s.storeId) } },
      select: { id: true, name: true },
    })
    const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]))
    byStoreWithNames = (byStore as any[]).map((s: any) => ({
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
    byPlatform: byPlatform.map(p => ({ platform: p.platform, count: p._count._all })),
    byStore:    byStoreWithNames,
  }
}
