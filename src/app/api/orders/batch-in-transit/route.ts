export const dynamic = 'force-dynamic'
export const maxDuration = 300
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { batchTransitionOrders } from '@/lib/services/order-batch.service'
import { deferAfterResponse } from '@/lib/utils/defer'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const { orderIds } = await req.json().catch(() => ({}))
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'orderIds requerido' }, { status: 400 })
  }

  try {
    const result = await batchTransitionOrders({
      orderIds,
      toStatus:       'IN_TRANSIT',
      fromStatuses:   ['RECEIVED'],
      eventNote:      'Salió a ruta — recepción masiva web',
      createdBy:      user.id,
      timestampField: 'inTransitAt',
    })

    // ── Notificar webhooks a Senby en segundo plano (no bloquea la respuesta) ──
    if (result.updated.length > 0) {
      const { notifyWebhooksBatch } = await import('@/lib/services/webhook.service')
      deferAfterResponse(
        notifyWebhooksBatch(
          result.updated.map(o => ({ orderId: o.id, storeId: o.storeId, previousStatus: o.previousStatus })),
          'IN_TRANSIT',
        ),
        'batch-in-transit webhooks',
      )
    }

    return NextResponse.json({ ok: true, updated: result.updated.length })
  } catch (err) {
    console.error('[batch-in-transit] Error en batch:', err)
    return NextResponse.json({ ok: false, error: 'Error actualizando pedidos' }, { status: 500 })
  }
}
