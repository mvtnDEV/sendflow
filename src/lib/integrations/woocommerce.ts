import crypto from 'crypto'
import type { NormalizedOrder } from '@/types'

/**
 * Verifica la firma HMAC del webhook de WooCommerce
 */
export function verifyWCWebhook(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  try {
    const digest = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64')
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature)
    )
  } catch {
    return false
  }
}

/**
 * Normaliza un pedido de WooCommerce al formato SendFlow
 */
export function normalizeWCOrder(payload: any): NormalizedOrder {
  const shipping = payload.shipping ?? {}
  const billing  = payload.billing  ?? {}
  const addr     = shipping.address_1 ? shipping : billing

  const firstName = addr.first_name ?? billing.first_name ?? ''
  const lastName  = addr.last_name  ?? billing.last_name  ?? ''

  return {
    externalId:    String(payload.id),
    platform:      'WOOCOMMERCE',
    customerName:  `${firstName} ${lastName}`.trim() || 'Sin nombre',
    customerPhone: billing.phone  || shipping.phone  || null,
    customerEmail: billing.email  || null,
    addressStreet: `${addr.address_1 ?? ''} ${addr.address_2 ?? ''}`.trim(),
    addressComuna: addr.city     ?? '',
    addressRegion: addr.state    ?? '',
    bultos:        payload.line_items?.length ?? 1,
    rawPayload:    payload,
  }
}
