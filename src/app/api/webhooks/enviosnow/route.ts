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
    // Leer el body como texto primero para loggearlo
    const rawBody = await req.text()
    console.log('[EnviosNow] Raw body recibido:', rawBody)
    console.log('[EnviosNow] Headers:', JSON.stringify(Object.fromEntries(req.headers)))

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.log('[EnviosNow] Error parseando JSON')
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    console.log('[EnviosNow] Body parseado:', JSON.stringify(body))

    // Aceptar cualquier estructura posible
    let deliveries: any[] = []

    if (Array.isArray(body)) {
      deliveries = body
    } else if (Array.isArray(body?.data)) {
      deliveries = body.data
    } else if (body?.data && typeof body.data === 'object') {
      deliveries = [body.data]
    } else if (typeof body === 'object') {
      deliveries = [body]
    }

    console.log('[EnviosNow] Deliveries encontrados:', deliveries.length)

    const results = []

    for (const delivery of deliveries) {
      console.log('[EnviosNow] Delivery:', JSON.stringify(delivery))

      // Buscar externalId en múltiples campos posibles
      const externalId = delivery.externalId
        ?? delivery.external_id
        ?? delivery.sourceSystemId
        ?? delivery.orderId
        ?? null

      // Buscar state en múltiples campos posibles
      const state = delivery.state
        ?? delivery.status
        ?? delivery.estado
        ?? null

      console.log('[EnviosNow] externalId:', externalId, '| state:', state)

      if (!externalId || !state) {
        console.log('[EnviosNow] Sin externalId o state, skip')
        results.push({ delivery, status: 'skipped_no_id_or_state' })
        continue
      }

      const newStatus = STATE_MAP[String(state).toLowerCase()]
      if (!newStatus) {
        console.log('[EnviosNow] Estado no mapeado:', state)
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

      console.log('[EnviosNow] Pedido encontrado:', order ? order.orderNumber : 'NO ENCONTRADO')

      if (!order) {
        results.push({ externalId, status: 'not_found' })
        continue
      }

      if ((STATUS_PRIORITY[newStatus] ?? 0) <= (STATUS_PRIORITY[order.status] ?? 0)) {
        results.push({ externalId, status: 'skipped', reason: 'lower_priority' })
        continue
      }

      const note = delivery.deliveryComment
        ?? delivery.commentary
        ?? delivery.comment
        ?? 'Actualizado desde Envios Now'

      const images = delivery.images ?? []
      const now = new Date()

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
          events: {
            create: {
              status:    newStatus as any,
              note,
              createdBy: 'system',
            },
          },
        },
      })

      results.push({ externalId, status: 'updated', newStatus })
    }

    console.log('[EnviosNow] Resultados:', JSON.stringify(results))
    return NextResponse.json({ received: true, results })

  } catch (err) {
    console.error('[EnviosNow] Error general:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
