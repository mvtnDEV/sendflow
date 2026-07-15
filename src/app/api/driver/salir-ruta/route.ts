export const dynamic = 'force-dynamic'
export const maxDuration = 300
import { NextRequest, NextResponse } from 'next/server'
import { batchTransitionOrders } from '@/lib/services/order-batch.service'

function verifyDriverToken(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString())
    if (payload.exp < Date.now()) return null
    if (payload.role !== 'DRIVER') return null
    return payload as { id: string; name: string; storeId: string | null }
  } catch { return null }
}

// POST /api/driver/salir-ruta — poner todos los pedidos recepcionados en camino
export async function POST(req: NextRequest) {
  const driver = verifyDriverToken(req)
  if (!driver) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const { orderIds } = await req.json().catch(() => ({}))
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'orderIds requerido' }, { status: 400 })
  }

  try {
    const result = await batchTransitionOrders({
      orderIds,
      toStatus:       'IN_TRANSIT',
      fromStatuses:   ['RECEIVED'],
      eventNote:      'Salió a ruta',
      createdBy:      driver.id,
      timestampField: 'inTransitAt',
    })
    return NextResponse.json({ ok: true, updated: result.updated.length })
  } catch (err) {
    console.error('[salir-ruta] Error en batch:', err)
    return NextResponse.json({ ok: false, error: 'Error actualizando pedidos' }, { status: 500 })
  }
}
