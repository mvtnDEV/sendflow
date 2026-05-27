export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const storeId = searchParams.get('storeId') || undefined
  const fecha   = searchParams.get('fecha') || new Date().toISOString().split('T')[0]

  const start = new Date(`${fecha}T00:00:00-03:00`)
  const end   = new Date(`${fecha}T23:59:59-03:00`)

  const where: any = {
    createdAt: { gte: start, lte: end },
    status: { in: ['IN_TRANSIT', 'DELIVERED', 'INCIDENT'] },
  }
  if (storeId) where.storeId = storeId

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      store:  { select: { name: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  const data = orders.map(o => ({
    id:            o.id,
    orderNumber:   o.orderNumber,
    sourceId:      o.platform === 'WOOCOMMERCE' ? (o.sourceId ?? '') : '',
    tienda:        o.store?.name ?? '',
    subTienda:     o.subStoreName ?? '',
    cliente:       o.customerName,
    direccion:     o.addressStreet,
    comuna:        o.addressComuna,
    estado:        o.status === 'IN_TRANSIT' ? 'En camino'
                 : o.status === 'DELIVERED'  ? 'Entregado'
                 : o.status === 'INCIDENT'   ? 'No entregado' : o.status,
    motivoNoEntrega: o.status === 'INCIDENT'
      ? (o.events[0]?.note ?? '')
      : '',
    entregadoEn: o.deliveredAt
      ? new Date(o.deliveredAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })
      : '',
  }))

  return NextResponse.json({ ok: true, data })
}
