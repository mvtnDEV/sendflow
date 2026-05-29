export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

const TZ      = 'America/Santiago'
const BATCH   = 1000 // traer de a 1000 para no sobrecargar DB

function getChileOffsetStr(): string {
  const now          = new Date()
  const utcDate      = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const santiagoDate = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  const offsetMs     = santiagoDate.getTime() - utcDate.getTime()
  const offsetHours  = offsetMs / (1000 * 60 * 60)
  const sign         = offsetHours >= 0 ? '+' : '-'
  return `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const storeId   = user.role === 'STORE_ADMIN'
    ? (user.storeId ?? undefined)
    : (searchParams.get('storeId') || undefined)
  const status    = searchParams.get('status')    || undefined
  const platform  = searchParams.get('platform')  || undefined
  const search    = searchParams.get('search')    || undefined
  const dateFrom  = searchParams.get('dateFrom')  || undefined
  const dateTo    = searchParams.get('dateTo')    || undefined
  const todayOnly = searchParams.get('todayOnly') === '1'

  const where: any = {}
  if (storeId)  where.storeId  = storeId
  if (status)   where.status   = status
  if (platform) where.platform = platform

  if (search) {
    where.OR = [
      { customerName:  { contains: search, mode: 'insensitive' } },
      { orderNumber:   { contains: search, mode: 'insensitive' } },
      { addressStreet: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (todayOnly) {
    const now   = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now)
    const y   = parts.find(p => p.type === 'year')!.value
    const m   = parts.find(p => p.type === 'month')!.value
    const d   = parts.find(p => p.type === 'day')!.value
    const off = getChileOffsetStr()
    where.createdAt = {
      gte: new Date(`${y}-${m}-${d}T00:00:00${off}`),
      lte: new Date(`${y}-${m}-${d}T23:59:59${off}`),
    }
  } else if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
    }
  }

  // ── Paginación en batches — sin límite artificial ──
  // Trae todos los pedidos de a 1000 para no sobrecargar la DB
  const allOrders: any[] = []
  let   skip = 0
  let   hasMore = true

  while (hasMore) {
    const batch = await prisma.order.findMany({
      where,
      include: { store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take:    BATCH,
      skip,
    })
    allOrders.push(...batch)
    skip    += BATCH
    hasMore  = batch.length === BATCH
  }

  return NextResponse.json({ ok: true, data: allOrders, total: allOrders.length })
}
