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
    const body = await req.json().catch(() => null)

    // Log para ver qué envía Envios Now
    console.log('[EnviosNow] Payload recibido:', JSON.stringify(body))

    if (!body) {
      console.log('[EnviosNow] Body vacío')
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Envios Now puede enviar { data: [...] } o directamente un array o un objeto
    const deliveries = Array.isArray(body)
      ? body
      : Array.isArray(body.data)
      ? body.data
      : [body]

    console.log('[EnviosNow] Deliveries a procesar:', deliveries.length)

    const results = []

    for (const delivery of deliveries) {
      console.log('[EnviosNow] Procesando delivery:', JSON.stringify(delivery))

      const externalId    = delivery.externalId ?? delivery.external_id ?? delivery.id
      const state         = delivery.state ?? delivery.status ?? delivery.estado
      const deliveryComment = delivery.deliveryComment ?? delivery.commentary ?? delivery.comment ?? ''
      const images        = delivery.images ?? []

      console.log('[EnviosNow] externalId:', externalId, '| state:', state)

      if (!externalId || !state) {
        console.log('[EnviosNow] Skipping - sin externalId o state')
        continue
      }

      const newStatus = STATE_MAP[state]
      if (!newStatus) {
        console.log('[EnviosNow] Estado no mapeado:', state)
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

      const note = deliveryComment || 'Actualizado desde Envios Now'
      const now  = new Date()

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
              createdBy: 'enviosnow-webhook',
            },
          },
        },
      })

      results.push({ externalId, status: 'updated', newStatus })
    }

    console.log('[EnviosNow] Resultados:', JSON.stringify(results))
    return NextResponse.json({ received: true, results })

  } catch (err) {
    console.error('[EnviosNow] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
