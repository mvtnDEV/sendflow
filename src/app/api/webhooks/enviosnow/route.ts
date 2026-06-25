export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { checkMLShipmentStatus } from '@/lib/integrations/mercadolibre-status'

const STATE_MAP: Record<string, string> = {
  'entregado':    'DELIVERED',
  'cancelado':    'CANCELLED',
  'por entregar': 'IN_TRANSIT',
  'pendiente':    'INCIDENT',
  'no entregado': 'INCIDENT',
  'fallido':      'INCIDENT',
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
      const nowId       = delivery.id ? String(delivery.id) : null
      const state       = delivery.state ?? delivery.status ?? null

      console.log('[EnviosNow] externalId:', externalId, '| nowId:', nowId, '| state:', state)

      if ((!externalId && !nowId) || !state) {
        results.push({ status: 'skipped_no_id_or_state' })
        continue
      }

      const newStatus = STATE_MAP[String(state).toLowerCase()]
      if (!newStatus) {
        results.push({ externalId, nowId, state, status: 'unknown_state' })
        continue
      }

      const extId = String(externalId ?? nowId)
      const orConditions: any[] = []
      if (externalId) {
        orConditions.push({ externalId: String(externalId) })
        orConditions.push({ orderNumber: String(externalId) })
        orConditions.push({ orderNumber: `#${externalId}` })
      }
      if (nowId) {
        orConditions.push({ externalId: nowId })
      }

      const order = await prisma.order.findFirst({
        where:  { OR: orConditions },
        select: { id: true, orderNumber: true, status: true, platform: true },
      })

      console.log('[EnviosNow] Pedido:', order ? order.orderNumber : 'NO ENCONTRADO', '| extId buscado:', extId)

      if (!order) {
        results.push({ externalId, nowId, status: 'not_found' })
        continue
      }

      const isDeliveredFromIncident = newStatus === 'DELIVERED' && order.status === 'INCIDENT'
      if (!isDeliveredFromIncident && (STATUS_PRIORITY[newStatus] ?? 0) <= (STATUS_PRIORITY[order.status] ?? 0)) {
        results.push({ externalId, nowId, status: 'skipped', reason: 'lower_priority' })
        continue
      }

      const now          = new Date()
      const images       = delivery.images ?? []
      const note         = delivery.deliveryComment || delivery.commentary || 'Actualizado desde Envios Now'
      const receiverName = delivery.receiverName || null
      const receiverRut  = delivery.receiverRut && delivery.receiverRut !== 'No da rut' ? delivery.receiverRut : null

      const evidenceNote = [
        note,
        receiverName ? `Recibió: ${receiverName}` : null,
        receiverRut  ? `RUT: ${receiverRut}`       : null,
      ].filter(Boolean).join(' · ')

      // ── Filtro ML Flex: si el pedido es de ML y Now dice DELIVERED/INCIDENT, ──
      // ── validar primero contra la API de ML antes de cerrar ──────────────────
      if (order.platform === 'MERCADOLIBRE' && (newStatus === 'DELIVERED' || newStatus === 'INCIDENT')) {
        const mlCheck = await checkMLShipmentStatus(order.id)

        if (!mlCheck || !mlCheck.isDelivered) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              pendingNowEvidence: {
                images,
                evidenceNote,
                attemptedStatus: newStatus,
                receivedFromNowAt: now.toISOString(),
              },
              pendingNowCheckedAt: now,
            },
          })
          console.log('[EnviosNow] ML Flex aún no confirma entrega, esperando:', order.orderNumber, '| ML status:', mlCheck?.shipmentStatus ?? 'sin respuesta')
          results.push({ externalId, nowId, status: 'waiting_ml_confirmation', mlShipmentStatus: mlCheck?.shipmentStatus ?? null })
          continue
        }

        console.log('[EnviosNow] ML Flex confirma entrega, cerrando pedido:', order.orderNumber)
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: newStatus as any,
          ...(newStatus === 'DELIVERED'  && { deliveredAt: now }),
          ...(newStatus === 'IN_TRANSIT' && { inTransitAt: now }),
          ...(newStatus === 'RECEIVED'   && { receivedAt:  now }),
          ...(images?.[0] && { evidencePhoto1: images[0] }),
          ...(images?.[1] && { evidencePhoto2: images[1] }),
          evidenceNote,
          pendingNowEvidence:  Prisma.JsonNull,
          pendingNowCheckedAt: null,
          events: {
            create: {
              status:    newStatus as any,
              note:      `Envios Now · ${note}${receiverName ? ` · Recibió: ${receiverName}` : ''}`,
              createdBy: 'enviosnow-webhook',
            },
          },
        },
      })

      console.log('[EnviosNow] Actualizado:', extId, '->', newStatus)
      results.push({ externalId, nowId, status: 'updated', newStatus })
    }

    console.log('[EnviosNow] Resultados:', JSON.stringify(results))
    return NextResponse.json({ received: true, results })
  } catch (err) {
    console.error('[EnviosNow] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
