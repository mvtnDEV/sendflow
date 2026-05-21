export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import {
  getExecutiveSummary, getOrdersByDay, getByPlatform,
  getByStore, getByDriver, getByComuna, getAvgDeliveryTime,
  getNivelServicioDiario,
} from '@/lib/services/reports.service'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const period  = searchParams.get('period') || 'month'
  const storeId = user.role === 'STORE_ADMIN'
    ? (user.storeId ?? undefined)
    : (searchParams.get('storeId') || undefined)

  try {
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 90
    const [summary, byDay, byPlatform, byStore, byDriver, byComuna, avgDelivery, nsDiario] = await Promise.all([
      getExecutiveSummary(storeId, period),
      getOrdersByDay(storeId, days),
      getByPlatform(storeId, period),
      user.role === 'SUPER_ADMIN' ? getByStore(period) : Promise.resolve([]),
      getByDriver(storeId, period),
      getByComuna(storeId, period),
      getAvgDeliveryTime(storeId, period),
      getNivelServicioDiario(storeId, 14),
    ])

    return NextResponse.json({
      ok:   true,
      data: { summary, byDay, byPlatform, byStore, byDriver, byComuna, avgDelivery, nsDiario },
    })
  } catch (err) {
    console.error('[GET /api/reports]', err)
    return NextResponse.json({ ok: false, error: 'Error generando reporte' }, { status: 500 })
  }
}
