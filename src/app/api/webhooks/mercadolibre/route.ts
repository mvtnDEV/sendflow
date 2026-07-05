export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decrypt, encrypt } from '@/lib/utils/crypto'
import { fetchMLOrder, extractMLOrderId, refreshMLToken } from '@/lib/integrations/mercadolibre'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'

function getMLStatus(order: any, shipment?: any): string | null {
  const shipStatus  = shipment?.status  ?? null
  const orderStatus = order?.status     ?? null
  if (shipStatus  === 'delivered')     return 'DELIVERED'
  if (shipStatus  === 'not_delivered') return 'INCIDENT'
  if (shipStatus  === 'shipped')       return 'IN_TRANSIT'
  if (orderStatus === 'cancelled')     return 'CANCELLED'
  return null
}

export async function POST(req: NextRequest) {
  // ── Captura temprana del body — evita 500 silencioso si ML manda body malformado ──
  let body: any = null
  try {
    const raw = await req.text()
    if (!raw || raw.trim() === '') {
      console.log('[ML webhook] Body vacío, ignorando')
      return NextResponse.json({ ok: true, skipped: true })
    }
    body = JSON.parse(raw)
  } catch (parseErr) {
    console.error('[ML webhook] Body no es JSON válido:', parseErr)
    // Responder 200 para que ML no reintente — el error es del body, no nuestro
    return NextResponse.json({ ok: true, skipped: true })
  }

  if (!body) return NextResponse.json({ ok: true, skipped: true })

  console.log('[ML webhook] body:', JSON.stringify(body))

  if (body.topic !== 'orders_v2') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const orderId = extractMLOrderId(body.resource)
  if (!orderId) {
    console.error('[ML webhook] resource inválido:', body.resource)
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    const integration = await prisma.storeIntegration.findFirst({
      where: {
        platform:        'MERCADOLIBRE',
        externalStoreId: String(body.user_id),
        isActive:        true,
      },
    })

    if (!integration) {
      console.error('[ML webhook] Integración no encontrada para user_id:', body.user_id)
      return NextResponse.json({ ok: true, skipped: true })
    }

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
    let normalized: any
    let rawOrder: any
    let rawShipment: any

    try {
      const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache:   'no-store',
      })
      if (!res.ok) throw new Error(`ML API ${res.status}`)
      rawOrder = await res.json()

      if (!rawOrder.shipping?.id) {
        console.log('[ML webhook] Pedido sin despacho, ignorando:', orderId)
        return NextResponse.json({ ok: true, skipped: true })
      }

      const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${rawOrder.shipping.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache:   'no-store',
      })
      if (shipRes.ok) {
        rawShipment = await shipRes.json()
        console.log('[ML webhook] Shipment status:', rawShipment.status)
      }

      normalized = await fetchMLOrder(orderId, token)

    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('403')) {
        console.log('[ML webhook] Token expirado, haciendo refresh...')
        try {
          const refreshed = await refreshMLToken(refreshToken)
          token = refreshed.accessToken
          await prisma.storeIntegration.update({
            where: { id: integration.id },
            data:  { apiKeyEnc: encrypt(`${refreshed.accessToken}|${refreshed.refreshToken}`) },
          })
          normalized = await fetchMLOrder(orderId, token)
          if (!normalized) return NextResponse.json({ ok: true, skipped: true })
        } catch (refreshErr) {
          console.error('[ML webhook] Error en refresh de token:', refreshErr)
          return NextResponse.json({ ok: true, skipped: true })
        }
      } else {
        console.error('[ML webhook] Error consultando ML API:', err)
        return NextResponse.json({ ok: true, skipped: true })
      }
    }

    if (normalized) {
      await upsertOrderFromWebhook(integration.storeId, integration.id, normalized)
    }

    const newStatus = getMLStatus(rawOrder, rawShipment)
    if (newStatus && ['DELIVERED', 'INCIDENT', 'CANCELLED'].includes(newStatus)) {
      const existing = await prisma.order.findFirst({
        where:  { integrationId: integration.id, sourceId: String(orderId) },
        select: { id: true, status: true },
      })
      if (existing && existing.status !== newStatus && existing.status !== 'DELIVERED') {
        const now         = new Date()
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
        console.log('[ML webhook] Estado actualizado:', orderId, '->', newStatus)
      }
    }

    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    })

    return NextResponse.json({ ok: true })

  } catch (err: any) {
    console.error('[ML webhook] Error interno:', err)
    // Responder 200 para evitar que ML reintente en bucle
    return NextResponse.json({ ok: true, error: 'handled' })
  }
}
