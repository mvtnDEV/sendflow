import crypto from 'crypto'
import type { NormalizedOrder } from '@/types'

// ─── Tipos de WooCommerce ─────────────────────────────────────────────────────

interface WCOrder {
  id:           number
  number:       string
  status:       string
  total:        string
  billing: {
    first_name: string
    last_name:  string
    phone?:     string
    email?:     string
    address_1:  string
    address_2?: string
    city:       string
    state:      string
    country:    string
  }
  shipping: {
    first_name: string
    last_name:  string
    address_1:  string
    address_2?: string
    city:       string
    state:      string
  }
  line_items: {
    id:       number
    name:     string
    quantity: number
    price:    string
    sku?:     string
  }[]
}

// ─── Verificar firma HMAC (WC usa x-wc-webhook-signature) ────────────────────

export function verifyWCWebhook(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

// ─── Normalización ────────────────────────────────────────────────────────────

export function normalizeWCOrder(raw: WCOrder): NormalizedOrder {
  // WooCommerce prioriza shipping, cae en billing si no hay
  const addr = raw.shipping?.address_1 ? raw.shipping : raw.billing

  return {
    externalId:    String(raw.id),
    platform:      'WOOCOMMERCE',
    customerName:  `${raw.billing.first_name} ${raw.billing.last_name}`.trim(),
    customerPhone: raw.billing.phone,
    customerEmail: raw.billing.email,
    addressStreet: [addr.address_1, addr.address_2].filter(Boolean).join(' '),
    addressComuna: addr.city,
    addressRegion: addr.state,
    bultos:        raw.line_items.reduce((acc, i) => acc + i.quantity, 0),
    rawPayload:    raw as unknown as Record<string, unknown>,
  }
}
