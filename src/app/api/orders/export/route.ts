export const dynamic = 'force-dynamic'
export const fetchCache = "force-no-store"; // nunca usar la caché de datos de Next con APIs externas (ML)
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import { buildOrdersWhere } from '@/lib/services/order.service'

const BATCH   = 1000 // traer de a 1000 para no sobrecargar DB

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

  // Mismos filtros que la pantalla Recepciones (incluida su definición de "hoy"): se descarga lo que se ve,
  // por ejemplo todos los "En camino" aunque se hayan creado antes de hoy.
  const where = buildOrdersWhere({
    storeId, status, platform, search, dateFrom, dateTo, todayOnly,
    superAdminView: user.role === 'SUPER_ADMIN',
  })

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
