import type { NormalizedOrder } from '@/types'

/**
 * Normaliza un pedido de Jumpseller al formato SendFlow
 */
export function normalizeJSOrder(order: any): NormalizedOrder {
  const customer  = order.customer  ?? {}
  const address   = order.shipping_address ?? order.billing_address ?? {}

  const firstName = customer.name  ?? address.name  ?? ''
  const lastName  = customer.surname ?? address.surname ?? ''
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || 'Sin nombre'

  return {
    externalId:    String(order.id),
    platform:      'JUMPSELLER',
    customerName:  fullName,
    customerPhone: customer.phone   || address.phone   || null,
    customerEmail: customer.email   || null,
    addressStreet: address.address  || address.street  || '',
    addressComuna: address.city     || address.commune || '',
    addressRegion: address.region   || address.province || '',
    bultos:        order.products?.length ?? 1,
    rawPayload:    order,
  }
}
