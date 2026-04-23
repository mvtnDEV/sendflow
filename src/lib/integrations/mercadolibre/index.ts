import type { NormalizedOrder } from '@/types'

// ─── Tipos de ML ──────────────────────────────────────────────────────────────

interface MLOrder {
  id: number
  status: string
  total_amount: number
  buyer: {
    id: number
    nickname: string
    phone?: { number: string; area_code?: string }
    email?: string
  }
  shipping: {
    id: number
    receiver_address?: {
      street_name: string
      street_number: string
      city:    { name: string }
      state:   { name: string }
      zip_code: string
      country: { name: string }
      comment?: string
    }
  }
  order_items: {
    item:       { id: string; title: string; seller_sku?: string }
    quantity:   number
    unit_price: number
  }[]
}

// ─── Normalización ────────────────────────────────────────────────────────────

export function normalizeMLOrder(raw: MLOrder): NormalizedOrder {
  const addr = raw.shipping?.receiver_address

  const street = addr
    ? `${addr.street_name} ${addr.street_number}`.trim()
    : 'Dirección no disponible'

  return {
    externalId:    String(raw.id),
    platform:      'MERCADOLIBRE',
    customerName:  raw.buyer.nickname,
    customerPhone: raw.buyer.phone
      ? `${raw.buyer.phone.area_code ?? ''} ${raw.buyer.phone.number}`.trim()
      : undefined,
    customerEmail: raw.buyer.email,
    addressStreet: street,
    addressComuna: addr?.city.name  ?? '',
    addressRegion: addr?.state.name ?? '',
    bultos:        raw.order_items.reduce((acc, i) => acc + i.quantity, 0),
    rawPayload:    raw as unknown as Record<string, unknown>,
  }
}

// ─── Fetch de orden por ID ────────────────────────────────────────────────────

export async function fetchMLOrder(
  orderId:     string,
  accessToken: string,
): Promise<NormalizedOrder> {
  const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`ML API ${res.status}: ${await res.text()}`)
  }

  const order = (await res.json()) as MLOrder
  return normalizeMLOrder(order)
}

// ─── Refresh de token OAuth ───────────────────────────────────────────────────

export async function refreshMLToken(refreshToken: string): Promise<{
  accessToken:  string
  refreshToken: string
  expiresIn:    number
}> {
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) throw new Error(`ML token refresh ${res.status}`)

  const data = await res.json()
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresIn:    data.expires_in,
  }
}

// ─── Parseo de notificación ───────────────────────────────────────────────────

export function extractMLOrderId(resource: string): string | null {
  // resource = "/orders/123456789"
  const match = resource.match(/\/orders\/(\d+)/)
  return match ? match[1] : null
}
