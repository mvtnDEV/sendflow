export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

const TZ = 'America/Santiago'

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
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const storeId = searchParams.get('storeId') || undefined
  const mes     = searchParams.get('mes') // formato YYYY-MM

  if (!mes) {
    return NextResponse.json({ ok: false, error: 'Parámetro mes requerido (YYYY-MM)' }, { status: 400 })
  }

  const [year, month] = mes.split('-').map(Number)
  const off   = getChileOffsetStr()
  const start = new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00${off}`)
  const end   = new Date(year, month, 0) // último día del mes
  const endStr = `${year}-${String(month).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}T23:59:59${off}`
  const endDate = new Date(endStr)

  // Obtener tiendas con tarifas
  const storeWhere: any = { isActive: true }
  if (storeId) storeWhere.id = storeId

  const stores = await prisma.store.findMany({
    where: storeWhere,
    select: {
      id:                true,
      name:              true,
      rut:               true,
      encargado:         true,
      tarifaUrbana:      true,
      tarifaExtraUrbana: true,
      tarifaRural:       true,
      tarifaRetiro:      true,
      fechaTarifa:       true,
    },
  })

  // Para cada tienda obtener pedidos entregados del mes
  const result = await Promise.all(stores.map(async store => {
    const orders = await prisma.order.findMany({
      where: {
        storeId:     store.id,
        status:      'DELIVERED',
        deliveredAt: { gte: start, lte: endDate },
      },
      select: {
        id:           true,
        orderNumber:  true,
        customerName: true,
        addressComuna: true,
        addressRegion: true,
        deliveredAt:  true,
        bultos:       true,
        platform:     true,
      },
      orderBy: { deliveredAt: 'asc' },
    })

    return {
      store: {
        id:                store.id,
        name:              store.name,
        rut:               store.rut,
        encargado:         store.encargado,
        tarifaUrbana:      store.tarifaUrbana      ? Number(store.tarifaUrbana)      : null,
        tarifaExtraUrbana: store.tarifaExtraUrbana ? Number(store.tarifaExtraUrbana) : null,
        tarifaRural:       store.tarifaRural       ? Number(store.tarifaRural)       : null,
        tarifaRetiro:      store.tarifaRetiro      ? Number(store.tarifaRetiro)      : null,
        fechaTarifa:       store.fechaTarifa,
      },
      orders,
      total: orders.length,
    }
  }))

  return NextResponse.json({ ok: true, data: result })
}
