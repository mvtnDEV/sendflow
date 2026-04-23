import type { NormalizedOrder } from '@/types'

export function normalizeShopifyOrder(payload: any): NormalizedOrder {
  const addr = payload.shipping_address || payload.billing_address || {}

  return {
    externalId:    String(payload.id),
    platform:      'SHOPIFY',
    customerName:  [payload.customer?.first_name, payload.customer?.last_name]
                    .filter(Boolean).join(' ') || addr.name || 'Sin nombre',
    customerPhone: payload.customer?.phone || addr.phone || '',
    customerEmail: payload.customer?.email || '',
    addressStreet: [addr.address1, addr.address2].filter(Boolean).join(' ') || '',
    addressComuna: addr.city || '',
    addressRegion: addr.province || '',
    bultos:        payload.line_items?.reduce((a: number, i: any) => a + (i.quantity || 1), 0) ?? 1,
    rawPayload:    payload as any,
  }
}

// Shopify Admin API: obtener pedido por ID
export async function fetchShopifyOrder(
  orderId:     string,
  domain:      string,
  accessToken: string,
): Promise<NormalizedOrder> {
  const res = await fetch(
    `https://${domain}/admin/api/2024-01/orders/${orderId}.json`,
    { headers: { 'X-Shopify-Access-Token': accessToken } },
  )
  if (!res.ok) throw new Error(`Shopify API ${res.status}`)
  const { order } = await res.json()
  return normalizeShopifyOrder(order)
}

// Crear webhook en Shopify programáticamente
export async function registerShopifyWebhook(
  domain:      string,
  accessToken: string,
  callbackUrl: string,
): Promise<{ id: number; topic: string }> {
  const res = await fetch(
    `https://${domain}/admin/api/2024-01/webhooks.json`,
    {
      method:  'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook: {
          topic:   'orders/create',
          address: callbackUrl,
          format:  'json',
        },
      }),
    },
  )
  if (!res.ok) throw new Error(`Shopify webhook register ${res.status}`)
  const { webhook } = await res.json()
  return webhook
}
