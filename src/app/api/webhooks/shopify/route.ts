export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { decrypt } from '@/lib/utils/crypto'
import {
  upsertOrderFromWebhook, updateOrderStatus, isRegionPermitida,
} from '@/lib/services/order.service'
import { normalizeShopifyOrder } from '@/lib/integrations/shopify'

/**
 * POST /api/webhooks/shopify
 *
 * Responder 200 a todo lo que no vamos a procesar (retiro en tienda, fuera de
 * la RM, tópicos ajenos). Un 4xx/5xx hace que Shopify reintente y, si los
 * fallos siguen, elimina la suscripción: la tienda dejaría de enviarnos pedidos.
 * Solo los errores transitorios (base de datos caída) devuelven 500.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac    = req.headers.get('x-shopify-hmac-sha256')
  const domain  = req.headers.get('x-shopify-shop-domain')?.toLowerCase()
  const topic   = req.headers.get('x-shopify-topic') ?? ''

  if (!hmac || !domain) {
    return NextResponse.json({ error: 'Headers faltantes' }, { status: 400 })
  }

  const integration = await prisma.storeIntegration.findFirst({
    where: { platform: 'SHOPIFY', externalStoreId: domain, isActive: true },
  })
  if (!integration) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  if (!firmaValida(rawBody, hmac, secretosCandidatos(integration))) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  if (!['orders/create', 'orders/updated', 'orders/cancelled'].includes(topic)) {
    return NextResponse.json({ ok: true, skipped: 'topic' })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: true, skipped: 'payload inválido' })
  }

  try {
    if (topic === 'orders/cancelled') {
      await cancelarPedido(integration.id, String(payload.id))
      return NextResponse.json({ ok: true })
    }

    const normalized = normalizeShopifyOrder(payload)
    if (!normalized) {
      return NextResponse.json({ ok: true, skipped: 'sin dirección de envío' })
    }
    if (!isRegionPermitida(normalized.addressRegion)) {
      console.warn('[Shopify webhook] Fuera de zona:', domain, payload.name, normalized.addressRegion)
      return NextResponse.json({ ok: true, skipped: 'fuera de zona de despacho' })
    }

    // orders/updated solo corrige pedidos que ya tenemos: si no, cualquier
    // edición de un pedido antiguo (ej. marcarlo enviado) lo crearía aquí.
    await upsertOrderFromWebhook(integration.storeId, integration.id, normalized, {
      createIfMissing: topic === 'orders/create',
    })
    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Shopify webhook]', domain, topic, err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

/**
 * Integraciones nuevas guardan el Client secret en webhookSecret. Las antiguas
 * (webhook creado a mano en Notificaciones) quedaron con webhookSecret vacío y
 * el signing secret como último valor de las credenciales cifradas.
 */
function secretosCandidatos(integration: { webhookSecret: string | null; apiKeyEnc: string }): string[] {
  const out: string[] = []
  if (integration.webhookSecret) out.push(integration.webhookSecret)
  try {
    const partes = decrypt(integration.apiKeyEnc).split('|')
    const ultimo = partes[partes.length - 1]
    if (ultimo && !out.includes(ultimo)) out.push(ultimo)
  } catch {
    // Credenciales ilegibles: solo queda webhookSecret.
  }
  return out
}

function firmaValida(rawBody: string, hmac: string, secretos: string[]): boolean {
  const recibido = Buffer.from(hmac, 'base64')
  return secretos.some(secret => {
    const esperado = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest()
    return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido)
  })
}

/** Solo se anula si aún no llega a bodega; si ya está en ruta, se deja aviso. */
async function cancelarPedido(integrationId: string, sourceId: string) {
  const order = await prisma.order.findFirst({
    where:  { integrationId, sourceId },
    select: { id: true, status: true },
  })
  if (!order || order.status === 'CANCELLED') return

  if (order.status === 'PENDING') {
    await updateOrderStatus(order.id, 'CANCELLED', 'Cancelado en Shopify', 'webhook')
    return
  }
  await prisma.orderEvent.create({
    data: {
      orderId:   order.id,
      status:    order.status,
      note:      '⚠ La tienda canceló este pedido en Shopify — revisar si sigue en ruta',
      createdBy: 'webhook',
    },
  })
}
