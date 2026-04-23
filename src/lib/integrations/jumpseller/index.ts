import type { NormalizedOrder } from '@/types'

// ─── Tipos de Jumpseller ──────────────────────────────────────────────────────

interface JSOrder {
  order: {
    id:           number
    number:       number
    status:       string
    total:        number
    customer: {
      name:   string
      email?: string
      phone?: string
    }
    shipping_address: {
      name?:    string
      address:  string
      city:     string
      region?:  string
      country?: string
    }
    products: {
      id:       number
      name:     string
      quantity: number
      price:    number
      sku?:     string
    }[]
  }
}

// ─── Normalización ────────────────────────────────────────────────────────────

export function normalizeJSOrder(raw: JSOrder['order']): NormalizedOrder {
  const addr = raw.shipping_address

  return {
    externalId:    String(raw.id),
    platform:      'JUMPSELLER',
    customerName:  raw.customer.name,
    customerPhone: raw.customer.phone,
    customerEmail: raw.customer.email,
    addressStreet: addr.address,
    addressComuna: addr.city,
    addressRegion: addr.region ?? '',
    bultos:        raw.products.reduce((acc, p) => acc + p.quantity, 0),
    rawPayload:    raw as unknown as Record<string, unknown>,
  }
}

// ─── Fetch de orden por ID (polling) ─────────────────────────────────────────

export async function fetchJSOrder(
  orderId: string,
  login:   string,
  token:   string,
): Promise<NormalizedOrder> {
  const res = await fetch(
    `https://api.jumpseller.com/v1/orders/${orderId}.json?login=${login}&authtoken=${token}`,
    { headers: { 'Content-Type': 'application/json' } },
  )

  if (!res.ok) throw new Error(`Jumpseller API ${res.status}: ${await res.text()}`)

  const data = (await res.json()) as JSOrder
  return normalizeJSOrder(data.order)
}

// ─── Polling de pedidos recientes ─────────────────────────────────────────────

export async function fetchRecentJSOrders(
  login: string,
  token: string,
  since?: Date,
): Promise<NormalizedOrder[]> {
  const params = new URLSearchParams({
    login,
    authtoken: token,
    limit:     '50',
    page:      '1',
    status:    'paid',
    ...(since && { after: since.toISOString() }),
  })

  const res = await fetch(
    `https://api.jumpseller.com/v1/orders.json?${params}`,
    { headers: { 'Content-Type': 'application/json' } },
  )

  if (!res.ok) throw new Error(`Jumpseller API ${res.status}`)

  const data = (await res.json()) as JSOrder[]
  return data.map(d => normalizeJSOrder(d.order))
}
