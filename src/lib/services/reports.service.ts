import { prisma } from '@/lib/db/prisma'

const TZ = 'America/Santiago'

// ─── Helper: offset real de Chile (maneja DST automáticamente) ────────────────

function getChileOffsetStr(): string {
  const now          = new Date()
  const utcDate      = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const santiagoDate = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  const offsetMs     = santiagoDate.getTime() - utcDate.getTime()
  const offsetHours  = offsetMs / (1000 * 60 * 60)
  const sign         = offsetHours >= 0 ? '+' : '-'
  const absHours     = Math.abs(offsetHours)
  return `${sign}${String(Math.floor(absHours)).padStart(2, '0')}:00`
}

// ─── Helper: inicio y fin de un día en hora chilena ───────────────────────────

function dayRange(date: Date): { gte: Date; lte: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)

  const year  = parts.find(p => p.type === 'year')!.value
  const month = parts.find(p => p.type === 'month')!.value
  const day   = parts.find(p => p.type === 'day')!.value
  const off   = getChileOffsetStr()

  return {
    gte: new Date(`${year}-${month}-${day}T00:00:00${off}`),
    lte: new Date(`${year}-${month}-${day}T23:59:59${off}`),
  }
}

// ─── Helper: inicio de un día en hora chilena ─────────────────────────────────

function startOfDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)

  const year  = parts.find(p => p.type === 'year')!.value
  const month = parts.find(p => p.type === 'month')!.value
  const day   = parts.find(p => p.type === 'day')!.value
  const off   = getChileOffsetStr()

  return new Date(`${year}-${month}-${day}T00:00:00${off}`)
}

// ─── Helper: fecha en formato YYYY-MM-DD en hora chilena ─────────────────────

function toChileDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

// ─── Rango de fechas en hora chilena ─────────────────────────────────────────

function rangeFor(period: string): { start: Date; end: Date } {
  const now   = new Date()
  const today = dayRange(now)
  const end   = today.lte  // fin de hoy en hora chilena

  let start: Date

  switch (period) {
    case 'week': {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      start = startOfDay(d)
      break
    }
    case 'month': {
      // Primer día del mes actual en hora chilena
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now)
      const year  = parts.find(p => p.type === 'year')!.value
      const month = parts.find(p => p.type === 'month')!.value
      const off   = getChileOffsetStr()
      start = new Date(`${year}-${month}-01T00:00:00${off}`)
      break
    }
    case 'last_month': {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now)
      const year  = parseInt(parts.find(p => p.type === 'year')!.value)
      const month = parseInt(parts.find(p => p.type === 'month')!.value)
      const off   = getChileOffsetStr()
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear  = month === 1 ? year - 1 : year
      const lastDay   = new Date(year, month - 1, 0).getDate()
      start = new Date(`${prevYear}-${String(prevMonth).padStart(2,'0')}-01T00:00:00${off}`)
      const endLastMonth = new Date(`${prevYear}-${String(prevMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}T23:59:59${off}`)
      return { start, end: endLastMonth }
    }
    case '3months': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 3)
      start = startOfDay(d)
      break
    }
    default: {
      // today
      start = today.gte
      break
    }
  }

  return { start, end }
}

// ─── NS Diario (últimos N días en hora chilena) ───────────────────────────────

export async function getNivelServicioDiario(storeId?: string, days = 14) {
  const off   = getChileOffsetStr()

  // Inicio del primer día en hora chilena
  const firstDay = new Date()
  firstDay.setDate(firstDay.getDate() - (days - 1))
  const firstDayStr = toChileDate(firstDay)
  const start = new Date(`${firstDayStr}T00:00:00${off}`)

  const where: any = {
    inTransitAt: { gte: start },
    status: { in: ['IN_TRANSIT', 'DELIVERED', 'INCIDENT'] },
  }
  if (storeId) where.storeId = storeId

  const orders = await prisma.order.findMany({
    where,
    select: { inTransitAt: true, status: true, deliveredAt: true },
  })

  // Construir mapa de días en hora chilena
  const byDay: Record<string, { inTransit: number; delivered: number; incident: number }> = {}

  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = toChileDate(d)
    byDay[key] = { inTransit: 0, delivered: 0, incident: 0 }
  }

  // Agrupar por día en hora chilena (no UTC)
  orders.forEach(o => {
    if (!o.inTransitAt) return
    const key = toChileDate(o.inTransitAt) // convierte a hora chilena
    if (!byDay[key]) return
    byDay[key].inTransit++
    if (o.status === 'DELIVERED') byDay[key].delivered++
    if (o.status === 'INCIDENT')  byDay[key].incident++
  })

  return Object.entries(byDay).map(([date, d]) => ({
    date,
    label:     new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { day:'2-digit', month:'short' }),
    inTransit: d.inTransit,
    delivered: d.delivered,
    incident:  d.incident,
    ns:        d.inTransit > 0 ? Math.round((d.delivered / d.inTransit) * 100) : null,
  }))
}

// ─── Resumen ejecutivo ────────────────────────────────────────────────────────

export async function getExecutiveSummary(storeId?: string, period = 'month') {
  const { start, end } = rangeFor(period)
  const where: any     = { createdAt: { gte: start, lte: end } }
  if (storeId) where.storeId = storeId

  const prevEnd   = new Date(start.getTime() - 1)
  const prevStart = new Date(prevEnd)
  switch (period) {
    case 'week':    prevStart.setDate(prevStart.getDate() - 6); break
    case 'month':   prevStart.setMonth(prevStart.getMonth() - 1, 1); break
    default:        prevStart.setDate(prevStart.getDate() - 1); break
  }
  const prevWhere: any = { createdAt: { gte: prevStart, lte: prevEnd } }
  if (storeId) prevWhere.storeId = storeId

  // NS del día actual en hora chilena
  const todayStart = dayRange(new Date()).gte
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

  const delivered   = statusMap['DELIVERED']  || 0
  const incidents   = statusMap['INCIDENT']   || 0
  const dispatched  = delivered + (statusMap['IN_TRANSIT'] || 0) + incidents
  const successRate = dispatched > 0 ? Math.round((delivered / dispatched) * 100) : 0
  const change      = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0

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
  const off      = getChileOffsetStr()
  const firstDay = new Date()
  firstDay.setDate(firstDay.getDate() - (days - 1))
  const firstDayStr = toChileDate(firstDay)
  const start = new Date(`${firstDayStr}T00:00:00${off}`)

  const where: any = { createdAt: { gte: start } }
  if (storeId) where.storeId = storeId

  const orders = await prisma.order.findMany({
    where,
    select:  { createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  })

  const byDay: Record<string, { total: number; delivered: number }> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = toChileDate(d)
    byDay[key] = { total: 0, delivered: 0 }
  }

  orders.forEach(o => {
    const key = toChileDate(o.createdAt)
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

  return {
    avgHours: Math.round(totalMs / orders.length / (1000 * 60 * 60) * 10) / 10,
    count:    orders.length,
  }
}
