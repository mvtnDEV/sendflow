import type { NormalizedOrder } from '@/types'

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
    id: number | null
    receiver_address?: {
      street_name:  string
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

interface MLShipment {
  receiver_address?: {
    street_name:    string
    street_number:  string
    city:           { name: string }
    state:          { name: string }
    zip_code:       string
    comment?:       string
    phone?:         { number: string; area_code?: string }
    receiver_name?: string
  }
}

export function normalizeMLOrder(raw: MLOrder, shipment?: MLShipment): NormalizedOrder {
  const addr = raw.shipping?.receiver_address ?? shipment?.receiver_address
  const street = addr
    ? `${addr.street_name} ${addr.street_number}`.trim()
    : 'Dirección no disponible'

  const customerName  = shipment?.receiver_address?.receiver_name ?? raw.buyer.nickname
  const phone         = raw.buyer.phone ?? shipment?.receiver_address?.phone
  const customerPhone = phone
    ? `${phone.area_code ?? ''} ${phone.number}`.trim()
    : undefined

  return {
    externalId:    String(raw.id),
    platform:      'MERCADOLIBRE',
    customerName,
    customerPhone,
    customerEmail: raw.buyer.email,
    addressStreet: street,
    addressComuna: addr?.city.name  ?? '',
    addressRegion: addr?.state.name ?? '',
    bultos:        raw.order_items.reduce((acc, i) => acc + i.quantity, 0),
    rawPayload:    raw as unknown as Record<string, unknown>,
  }
}

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

  // Si no tiene shipping ID es retiro en punto — no es despacho a domicilio
  if (!order.shipping?.id) {
    throw new Error('Pedido sin despacho a domicilio — retiro en punto, ignorando')
  }

  // Si tiene shipping ID pero sin dirección, consultar el shipment
  let shipment: MLShipment | undefined
  if (!order.shipping?.receiver_address) {
    try {
      const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${order.shipping.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (shipRes.ok) {
        shipment = await shipRes.json()
        console.log('[ML] Dirección obtenida del shipment:', order.shipping.id)
      }
    } catch (err) {
      console.warn('[ML] No se pudo obtener shipment:', err)
    }
  }

  return normalizeMLOrder(order, shipment)
}

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

export function extractMLOrderId(resource: string): string | null {
  const match = resource.match(/\/orders\/(\d+)/)
  return match ? match[1] : null
}
