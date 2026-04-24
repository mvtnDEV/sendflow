export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const storeId   = user.role === 'STORE_ADMIN'
    ? (user.storeId ?? undefined)
    : (searchParams.get('storeId') || undefined)
  const status    = searchParams.get('status')   || undefined
  const platform  = searchParams.get('platform') || undefined
  const search    = searchParams.get('search')   || undefined
  const dateFrom  = searchParams.get('dateFrom') || undefined
  const dateTo    = searchParams.get('dateTo')   || undefined
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
    const start = new Date(); start.setHours(0,0,0,0)
    const end   = new Date(); end.setHours(23,59,59,999)
    where.createdAt = { gte: start, lte: end }
  } else if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
    }
  }

  const orders = await prisma.order.findMany({
    where,
    include: { store: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })

  return NextResponse.json({ ok: true, data: orders })
}
