export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decrypt, encrypt } from '@/lib/utils/crypto'
import { fetchMLOrder, extractMLOrderId, refreshMLToken } from '@/lib/integrations/mercadolibre'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'

// Mapeo de estados ML → SendFlow
function getMLStatus(order: any, shipment?: any): string | null {
  const shipStatus = shipment?.status ?? null
  const orderStatus = order?.status ?? null
  if (shipStatus === 'delivered') return 'DELIVERED'
  if (shipStatus === 'not_delivered') return 'INCIDENT'
  if (shipStatus === 'shipped') return 'IN_TRANSIT'
  if (orderStatus === 'cancelled') return 'CANCELLED'
  return null
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  console.log('[ML webhook] body:', JSON.stringify(body))

  if (body.topic !== 'orders_v2') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const orderId = extractMLOrderId(body.resource)
  if (!orderId) {
    return NextResponse.json({ error: 'resource inválido' }, { status: 400 })
  }

  const integration = await prisma.storeIntegration.findFirst({
    where: {
      platform:        'MERCADOLIBRE',
      externalStoreId: String(body.user_id),
      isActive:        true,
    },
  })

  if (!integration) {
    return NextResponse.json({ error: 'Integración no encontrada' }, { status: 404 })
  }

  try {
    const creds = decrypt(integration.apiKeyEnc)
    let accessToken: string
    let refreshToken: string

    if (creds.startsWith('{')) {
      const parsed = JSON.parse(creds)
      accessToken  = parsed.accessToken
      refreshToken = parsed.refreshToken
    } else {
      const [at, rt] = creds.split('|')
      accessToken  = at
      refreshToken = rt
    }

    let token = accessToken
    let normalized
    let rawOrder: any
    let rawShipment: any

    try {
      // Obtener orden de ML
      const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`ML API ${res.status}`)
      rawOrder = await res.json()

      // Si no tiene shipping ID ignorar
      if (!rawOrder.shipping?.id) {
        console.log('[ML webhook] Pedido sin despacho, ignorando:', orderId)
        return NextResponse.json({ ok: true, skipped: true })
      }

      // Obtener shipment para estado de entrega
      const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${rawOrder.shipping.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (shipRes.ok) {
        rawShipment = await shipRes.json()
        console.log('[ML webhook] Shipment status:', rawShipment.status)
      }

      normalized = await fetchMLOrder(orderId, token)
    } catch (err: any) {
      if (err.message?.includes('sin despacho')) {
        console.log('[ML webhook] Pedido sin despacho, ignorando:', orderId)
        return NextResponse.json({ ok: true, skipped: true })
      }
      if (err.message?.includes('401') || err.message?.includes('403')) {
        console.log('[ML webhook] Token expirado, haciendo refresh...')
        const refreshed = await refreshMLToken(refreshToken)
        token = refreshed.accessToken
        await prisma.storeIntegration.update({
          where: { id: integration.id },
          data:  { apiKeyEnc: encrypt(`${refreshed.accessToken}|${refreshed.refreshToken}`) },
        })
        normalized = await fetchMLOrder(orderId, token)
        if (!normalized) return NextResponse.json({ ok: true, skipped: true })
      } else {
        throw err
      }
    }

    // Crear o actualizar pedido
    await upsertOrderFromWebhook(integration.storeId, integration.id, normalized)

    // Actualizar estado si ML indica entrega o incidencia
    const newStatus = getMLStatus(rawOrder, rawShipment)
    if (newStatus && ['DELIVERED', 'INCIDENT', 'CANCELLED'].includes(newStatus)) {
      const existing = await prisma.order.findFirst({
        where: { integrationId: integration.id, sourceId: String(orderId) },
        select: { id: true, status: true },
      })

      if (existing && existing.status !== newStatus && existing.status !== 'DELIVERED') {
        const now = new Date()

        // Si el shipment confirma date_shipped, lo guardamos como mlShippedAt
        // (esto evita que quede en null cuando el pedido se cierra muy rápido,
        // antes de que el cron de check-ml-shipped llegue a registrarlo)
        const dateShipped = rawShipment?.status_history?.date_shipped ?? null

        await prisma.order.update({
          where: { id: existing.id },
          data: {
            status: newStatus as any,
            ...(newStatus === 'DELIVERED' && { deliveredAt: now }),
            ...(dateShipped && { mlShippedAt: new Date(dateShipped) }),
            events: {
              create: {
                status:    newStatus as any,
                note:      `ML Flex · Estado actualizado a ${newStatus}`,
                createdBy: 'ml-webhook',
              },
            },
          },
        })
        console.log('[ML webhook] Estado actualizado:', orderId, '->', newStatus, '| mlShippedAt:', dateShipped)
      }
    }

    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.message?.includes('sin despacho')) {
      console.log('[ML webhook] Pedido sin despacho (post-refresh), ignorando:', orderId)
      return NextResponse.json({ ok: true, skipped: true })
    }
    console.error('[ML webhook]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
