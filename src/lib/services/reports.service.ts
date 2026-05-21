import { prisma } from '@/lib/db/prisma'

// ─── Rango de fechas ──────────────────────────────────────────────────────────

function rangeFor(period: string): { start: Date; end: Date } {
  const now   = new Date()
  const end   = new Date(now)
  end.setHours(23, 59, 59, 999)

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  switch (period) {
    case 'week':
      start.setDate(start.getDate() - 6)
      break
    case 'month':
      start.setDate(1)
      break
    case 'last_month': {
      start.setMonth(start.getMonth() - 1, 1)
      end.setDate(0)
      end.setHours(23, 59, 59, 999)
      break
    }
    case '3months':
      start.setMonth(start.getMonth() - 3)
      break
    default:
      break
  }
  return { start, end }
}

// ─── NS Diario (últimos 14 días) ──────────────────────────────────────────────

export async function getNivelServicioDiario(storeId?: string, days = 14) {
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)

  const where: any = {
    inTransitAt: { gte: start },
    status: { in: ['IN_TRANSIT', 'DELIVERED', 'INCIDENT'] },
  }
  if (storeId) where.storeId = storeId

  const orders = await prisma.order.findMany({
    where,
    select: { inTransitAt: true, status: true, deliveredAt: true },
  })

  // Agrupar por día de salida a ruta
  const byDay: Record<string, { inTransit: number; delivered: number; incident: number }> = {}

  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    byDay[key] = { inTransit: 0, delivered: 0, incident: 0 }
  }

  orders.forEach(o => {
    if (!o.inTransitAt) return
    const key = o.inTransitAt.toISOString().slice(0, 10)
    if (!byDay[key]) return
    byDay[key].inTransit++
    if (o.status === 'DELIVERED') byDay[key].delivered++
    if (o.status === 'INCIDENT')  byDay[key].incident++
  })

  return Object.entries(byDay).map(([date, d]) => ({
    date,
    label:      new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { day:'2-digit', month:'short' }),
    inTransit:  d.inTransit,
    delivered:  d.delivered,
    incident:   d.incident,
    ns:         d.inTransit > 0 ? Math.round((d.delivered / d.inTransit) * 100) : null,
  }))
}

// ─── Resumen ejecutivo ────────────────────────────────────────────────────────

export async function getExecutiveSummary(storeId?: string, period = 'month') {
  const { start, end } = rangeFor(period)
  const where: any     = { createdAt: { gte: start, lte: end } }
  if (storeId) where.storeId = storeId

  const prevEnd   = new Date(start)
  prevEnd.setMilliseconds(-1)
  const prevStart = new Date(prevEnd)
  switch (period) {
    case 'week':    prevStart.setDate(prevStart.getDate() - 6); break
    case 'month':   prevStart.setMonth(prevStart.getMonth() - 1, 1); break
    default:        prevStart.setDate(prevStart.getDate() - 1); break
  }
  const prevWhere: any = { createdAt: { gte: prevStart, lte: prevEnd } }
  if (storeId) prevWhere.storeId = storeId

  // NS del día actual
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const nsWhere: any = {
    inTransitAt: { gte: todayStart },
    status: { in: ['IN_TRANSIT', 'DELIVERED', 'INCIDENT'] },
  }
  if (storeId) nsWhere.storeId = storeId

  const [current, previous, byStatus, nsOrders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: prevWhere }),
    prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.order.findMany({ where: nsWhere, select: { status: true } }),
  ])

  const statusMap: Record<string, number> = {}
  byStatus.forEach(s => { statusMap[s.status] = s._count._all })

  const delivered    = statusMap['DELIVERED']  || 0
  const incidents    = statusMap['INCIDENT']   || 0
  const successRate  = current > 0 ? Math.round((delivered / current) * 100) : 0
  const change       = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0

  // NS hoy
  const nsTotal     = nsOrders.length
  const nsDelivered = nsOrders.filter(o => o.status === 'DELIVERED').length
  const nsHoy       = nsTotal > 0 ? Math.round((nsDelivered / nsTotal) * 100) : null

  return {
    total:       current,
    previous,
    change,
    delivered,
    pending:     statusMap['PENDING']    || 0,
    inTransit:   statusMap['IN_TRANSIT'] || 0,
    received:    statusMap['RECEIVED']   || 0,
    incidents,
    successRate,
    nsHoy,
    nsTotal,
    nsDelivered,
  }
}

// ─── Pedidos por día ──────────────────────────────────────────────────────────

export async function getOrdersByDay(storeId?: string, days = 30) {
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)

  const where: any = { createdAt: { gte: start } }
  if (storeId) where.storeId = storeId

  const orders = await prisma.order.findMany({
    where,
    select: { createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  })

  const byDay: Record<string, { total: number; delivered: number }> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    byDay[key] = { total: 0, delivered: 0 }
  }

  orders.forEach(o => {
    const key = o.createdAt.toISOString().slice(0, 10)
    if (byDay[key]) {
      byDay[key].total++
      if (o.status === 'DELIVERED') byDay[key].delivered++
    }
  })

  return Object.entries(byDay).map(([date, counts]) => ({
    date,
    label:     new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { day:'2-digit', month:'short' }),
    total:     counts.total,
    delivered: counts.delivered,
  }))
}

// ─── Por plataforma ───────────────────────────────────────────────────────────

export async function getByPlatform(storeId?: string, period = 'month') {
  const { start, end } = rangeFor(period)
  const where: any     = { createdAt: { gte: start, lte: end } }
  if (storeId) where.storeId = storeId

  const data = await prisma.order.groupBy({
    by:      ['platform'],
    where,
    _count:  { _all: true },
    orderBy: { _count: { platform: 'desc' } },
  })

  const total = data.reduce((acc, d) => acc + d._count._all, 0)
  return data.map(d => ({
    platform: d.platform,
    count:    d._count._all,
    pct:      total > 0 ? Math.round((d._count._all / total) * 100) : 0,
  }))
}

// ─── Por tienda ───────────────────────────────────────────────────────────────

export async function getByStore(period = 'month') {
  const { start, end } = rangeFor(period)

  const data = await prisma.order.groupBy({
    by:      ['storeId'],
    where:   { createdAt: { gte: start, lte: end } },
    _count:  { _all: true },
    orderBy: { _count: { storeId: 'desc' } },
    take:    10,
  })

  const stores = await prisma.store.findMany({
    where:  { id: { in: data.map(d => d.storeId) } },
    select: { id: true, name: true },
  })
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]))

  return data.map(d => ({
    storeId:   d.storeId,
    storeName: storeMap[d.storeId] || 'Desconocida',
    count:     d._count._all,
  }))
}

// ─── Por conductor ────────────────────────────────────────────────────────────

export async function getByDriver(storeId?: string, period = 'month') {
  const { start, end } = rangeFor(period)

  const where: any = {
    evidenceTakenAt: { gte: start, lte: end },
    evidenceTakenBy: { not: null },
  }
  if (storeId) where.storeId = storeId

  const data = await prisma.order.groupBy({
    by:      ['evidenceTakenBy'],
    where,
    _count:  { _all: true },
    orderBy: { _count: { evidenceTakenBy: 'desc' } },
  })

  const driverIds = data.map(d => d.evidenceTakenBy).filter(Boolean) as string[]
  const drivers   = await prisma.user.findMany({
    where:  { id: { in: driverIds } },
    select: { id: true, name: true },
  })
  const driverMap = Object.fromEntries(drivers.map(d => [d.id, d.name]))

  return data
    .filter(d => d.evidenceTakenBy)
    .map(d => ({
      driverId:   d.evidenceTakenBy!,
      driverName: driverMap[d.evidenceTakenBy!] || 'Conductor eliminado',
      delivered:  d._count._all,
    }))
}

// ─── Por comuna ───────────────────────────────────────────────────────────────

export async function getByComuna(storeId?: string, period = 'month') {
  const { start, end } = rangeFor(period)
  const where: any     = { createdAt: { gte: start, lte: end } }
  if (storeId) where.storeId = storeId

  const data = await prisma.order.groupBy({
    by:      ['addressComuna', 'addressRegion'],
    where,
    _count:  { _all: true },
    orderBy: { _count: { addressComuna: 'desc' } },
    take:    20,
  })

  return data.map(d => ({
    comuna: d.addressComuna,
    region: d.addressRegion,
    count:  d._count._all,
  }))
}

// ─── Tiempo promedio de entrega ───────────────────────────────────────────────

export async function getAvgDeliveryTime(storeId?: string, period = 'month') {
  const { start, end } = rangeFor(period)
  const where: any = {
    status:      'DELIVERED',
    deliveredAt: { not: null },
    createdAt:   { gte: start, lte: end },
  }
  if (storeId) where.storeId = storeId

  const orders = await prisma.order.findMany({
    where,
    select: { createdAt: true, deliveredAt: true },
    take:   1000,
  })

  if (orders.length === 0) return { avgHours: 0, count: 0 }

  const totalMs = orders.reduce((acc, o) => {
    return acc + (o.deliveredAt!.getTime() - o.createdAt.getTime())
  }, 0)

  const avgMs    = totalMs / orders.length
  const avgHours = Math.round(avgMs / (1000 * 60 * 60) * 10) / 10

  return { avgHours, count: orders.length }
}
