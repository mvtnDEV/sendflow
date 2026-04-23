import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { decrypt } from '@/lib/utils/crypto'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'
import type { NormalizedOrder } from '@/types'

// POST /api/webhooks/shopify
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac    = req.headers.get('x-shopify-hmac-sha256')
  const domain  = req.headers.get('x-shopify-shop-domain')
  const topic   = req.headers.get('x-shopify-topic')

  if (!hmac || !domain) {
    return NextResponse.json({ error: 'Headers faltantes' }, { status: 400 })
  }

  // Solo procesar creación/actualización de pedidos
  if (!topic?.startsWith('orders/')) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Buscar integración por dominio
  const integration = await prisma.storeIntegration.findFirst({
    where: { platform: 'SHOPIFY', externalStoreId: domain, isActive: true },
  })

  if (!integration) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  // Verificar firma HMAC
  const secret = integration.webhookSecret ?? decrypt(integration.apiKeyEnc)
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  const valid  = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))

  if (!valid) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  // Parsear y normalizar pedido
  let normalized: NormalizedOrder
  try {
    const payload = JSON.parse(rawBody)
    const addr    = payload.shipping_address ?? payload.billing_address ?? {}

    normalized = {
      externalId:    String(payload.id),
      platform:      'SHOPIFY',
      customerName:  `${payload.customer?.first_name ?? ''} ${payload.customer?.last_name ?? ''}`.trim(),
      customerPhone: payload.customer?.phone ?? addr.phone,
      customerEmail: payload.customer?.email,
      addressStreet: `${addr.address1 ?? ''} ${addr.address2 ?? ''}`.trim(),
      addressComuna: addr.city ?? '',
      addressRegion: addr.province ?? '',
      bultos:        payload.line_items?.length ?? 1,
      rawPayload:    payload as any,
    }
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  try {
    await upsertOrderFromWebhook(integration.storeId, integration.id, normalized)
    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Shopify webhook]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
