export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

const STATE_MAP: Record<string, string> = {
  'entregado':    'DELIVERED',
  'cancelado':    'CANCELLED',
  'por entregar': 'IN_TRANSIT',
  'pendiente':    'INCIDENT',
}

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0, RECEIVED: 1, IN_TRANSIT: 2,
  DELIVERED: 3, INCIDENT: 4, CANCELLED: 5,
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    console.log('[EnviosNow] Raw body:', rawBody)

    let body: any
    try { body = JSON.parse(rawBody) } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    let deliveries: any[] = []
    if (Array.isArray(body)) deliveries = body
    else if (Array.isArray(body?.data)) deliveries = body.data
    else if (body?.data && typeof body.data === 'object') deliveries = [body.data]
    else if (typeof body === 'object') deliveries = [body]

    const results = []

    for (const delivery of deliveries) {
      const externalId = delivery.externalId ?? delivery.external_id ?? null
      const state      = delivery.state ?? delivery.status ?? null

      console.log('[EnviosNow] externalId:', externalId, '| state:', state)

      if (!externalId || !state) {
        results.push({ status: 'skipped_no_id_or_state' })
        continue
      }

      const newStatus = STATE_MAP[String(state).toLowerCase()]
      if (!newStatus) {
        results.push({ externalId, state, status: 'unknown_state' })
        continue
      }

      const extId = String(externalId)
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { externalId: extId },
            { orderNumber: extId },
            { orderNumber: `#${extId}` },
          ],
        },
      })

      console.log('[EnviosNow] Pedido:', order ? order.orderNumber : 'NO ENCONTRADO')

      if (!order) {
        results.push({ externalId, status: 'not_found' })
        continue
      }

      if ((STATUS_PRIORITY[newStatus] ?? 0) <= (STATUS_PRIORITY[order.status] ?? 0)) {
        results.push({ externalId, status: 'skipped', reason: 'lower_priority' })
        continue
      }

      const now    = new Date()
      const images = delivery.images ?? []
      const note   = delivery.deliveryComment || delivery.commentary || 'Actualizado desde Envios Now'

      // Actualizar pedido SIN crear evento (evita el error de foreign key)
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: newStatus as any,
          ...(newStatus === 'DELIVERED'  && { deliveredAt: now }),
          ...(newStatus === 'IN_TRANSIT' && { inTransitAt: now }),
          ...(newStatus === 'RECEIVED'   && { receivedAt:  now }),
          ...(images?.[0] && { evidencePhoto1: images[0] }),
          ...(images?.[1] && { evidencePhoto2: images[1] }),
          evidenceNote: note,
        },
      })

      console.log('[EnviosNow] Actualizado:', extId, '->', newStatus)
      results.push({ externalId, status: 'updated', newStatus })
    }

    console.log('[EnviosNow] Resultados:', JSON.stringify(results))
    return NextResponse.json({ received: true, results })

  } catch (err) {
    console.error('[EnviosNow] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
