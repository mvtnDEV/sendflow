export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// Mapeo de estados de Envios Now → SendFlow
const STATE_MAP: Record<string, string> = {
  'entregado':   'DELIVERED',
  'cancelado':   'CANCELLED',
  'por entregar':'IN_TRANSIT',
  'pendiente':   'RECEIVED',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body?.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const results = []

    for (const delivery of body.data) {
      const { externalId, state, deliveryComment, commentary, images } = delivery

      if (!externalId || !state) continue

      const newStatus = STATE_MAP[state]
      if (!newStatus) continue

      // Buscar el pedido en SendFlow por externalId o orderNumber
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { externalId: String(externalId) },
            { orderNumber: String(externalId) },
          ],
        },
      })

      if (!order) {
        results.push({ externalId, status: 'not_found' })
        continue
      }

      // No retroceder estados
      const STATUS_PRIORITY: Record<string, number> = {
        PENDING: 0, RECEIVED: 1, IN_TRANSIT: 2,
        DELIVERED: 3, INCIDENT: 4, CANCELLED: 5,
      }
      if ((STATUS_PRIORITY[newStatus] ?? 0) <= (STATUS_PRIORITY[order.status] ?? 0)) {
        results.push({ externalId, status: 'skipped', reason: 'lower_priority' })
        continue
      }

      const note = deliveryComment || commentary || `Actualizado desde Envios Now`
      const now  = new Date()

      // Actualizar el pedido
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status:       newStatus as any,
          ...(newStatus === 'DELIVERED'  && { deliveredAt: now }),
          ...(newStatus === 'IN_TRANSIT' && { inTransitAt: now }),
          ...(newStatus === 'RECEIVED'   && { receivedAt:  now }),
          ...(images?.[0] && { evidencePhoto1: images[0] }),
          ...(images?.[1] && { evidencePhoto2: images[1] }),
          ...(note && { evidenceNote: note }),
          events: {
            create: {
              status:    newStatus as any,
              note:      note,
              createdBy: 'enviosnow-webhook',
            },
          },
        },
      })

      results.push({ externalId, status: 'updated', newStatus })
    }

    return NextResponse.json({ received: true, results })

  } catch (err) {
    console.error('[Envios Now webhook]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
