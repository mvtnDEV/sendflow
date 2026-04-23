import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { getDashboardStats } from '@/lib/services/order.service'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/stats
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const storeId = user.role === 'STORE_ADMIN' ? (user.storeId ?? undefined) : undefined

  try {
    const stats = await getDashboardStats(storeId)
    return NextResponse.json({ ok: true, data: stats })
  } catch (err) {
    console.error('[GET /api/dashboard/stats]', err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
