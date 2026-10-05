import { prisma } from '@/lib/db/prisma'
import { decrypt } from '@/lib/utils/crypto'
import { normalizeShopDomain, getShopifyAccessToken, shopifyGraphQL } from './index'

/**
 * Devuelve a Shopify los estados de despacho de SendFlow:
 *   - IN_TRANSIT → crea el fulfillment (pedido "Preparado") con el link de seguimiento
 *   - DELIVERED  → marca ese fulfillment como entregado (si faltaba, lo crea antes)
 *
 * Nunca lanza: el cambio de estado en SendFlow ya ocurrió y no debe depender de
 * Shopify. Si algo falla solo queda en el log.
 *
 * Permisos de la app: write_merchant_managed_fulfillment_orders (crear el
 * fulfillment) y write_fulfillments (evento "entregado").
 */

// Correo de Shopify "Tu pedido va en camino". Apagado hasta que cada tienda lo
// decida: varias ya avisan al cliente por WhatsApp.
const NOTIFY_CUSTOMER  = false
const TRACKING_COMPANY = 'Moovex'

const ESTADOS_SINCRONIZADOS = new Set(['IN_TRANSIT', 'DELIVERED'])

type PedidoShopify = {
  orderNumber: string
  qrCode:      string
  sourceId:    string | null
  integration: { platform: string; apiKeyEnc: string; isActive: boolean } | null
}

type FulfillmentInfo = { id: string; delivered: boolean }

export async function syncShopifyStatus(orderId: string, status: string): Promise<void> {
  if (!ESTADOS_SINCRONIZADOS.has(status)) return
  const order = await prisma.order.findFirst({
    where:  { id: orderId, platform: 'SHOPIFY' },
    select: SELECT_PEDIDO,
  })
  if (order) await sincronizar(order, status)
}

/** Para los cambios masivos (batch-in-transit, batch-receive): pocos pedidos a la vez por los límites de Shopify. */
export async function syncShopifyStatusBatch(orderIds: string[], status: string): Promise<void> {
  if (!ESTADOS_SINCRONIZADOS.has(status) || orderIds.length === 0) return
  const orders = await prisma.order.findMany({
    where:  { id: { in: orderIds }, platform: 'SHOPIFY' },
    select: SELECT_PEDIDO,
  })
  if (orders.length === 0) return
  const { mapWithConcurrency } = await import('@/lib/utils/concurrency')
  await mapWithConcurrency(orders, 3, o => sincronizar(o, status))
}

const SELECT_PEDIDO = {
  orderNumber: true,
  qrCode:      true,
  sourceId:    true,
  integration: { select: { platform: true, apiKeyEnc: true, isActive: true } },
} as const

async function sincronizar(order: PedidoShopify, status: string) {
  const integ = order.integration
  if (!order.sourceId || !integ?.isActive || integ.platform !== 'SHOPIFY') return

  const creds = credenciales(integ.apiKeyEnc)
  if (!creds) return   // integración antigua (webhook a mano, sin Client ID): no puede escribir en Shopify

  try {
    const { token } = await getShopifyAccessToken(creds.domain, creds.clientId, creds.clientSecret)
    const fulfillments = await asegurarFulfillments(creds.domain, token, order)
    if (status === 'DELIVERED') {
      for (const f of fulfillments) {
        if (!f.delivered) await marcarEntregado(creds.domain, token, f.id)
      }
    }
  } catch (err) {
    console.error('[Shopify estados]', creds.domain, order.orderNumber, status, err instanceof Error ? err.message : err)
  }
}

/** Integraciones conectadas en un paso guardan "dominio|clientId|clientSecret". */
function credenciales(apiKeyEnc: string) {
  try {
    const [domain, clientId, clientSecret] = decrypt(apiKeyEnc).split('|')
    if (!normalizeShopDomain(domain ?? '') || !clientId || !clientSecret) return null
    return { domain, clientId, clientSecret }
  } catch {
    return null
  }
}

/**
 * Devuelve los fulfillments de Moovex del pedido; si no hay, los crea con los
 * fulfillment orders abiertos. Idempotente: un webhook repetido no duplica.
 */
async function asegurarFulfillments(domain: string, token: string, order: PedidoShopify): Promise<FulfillmentInfo[]> {
  const data = await shopifyGraphQL<{
    order: {
      fulfillments: { id: string; status: string; displayStatus: string | null; trackingInfo: { company: string | null }[] }[]
      fulfillmentOrders: { nodes: { id: string; supportedActions: { action: string }[] }[] }
    } | null
  }>(domain, token, `
    query ($id: ID!) {
      order(id: $id) {
        fulfillments(first: 20) { id status displayStatus trackingInfo(first: 1) { company } }
        fulfillmentOrders(first: 20) { nodes { id supportedActions { action } } }
      }
    }`, { id: `gid://shopify/Order/${order.sourceId}` }, 'write_merchant_managed_fulfillment_orders')

  if (!data.order) throw new Error('el pedido ya no existe en Shopify')

  const exitosos = data.order.fulfillments.filter(f => f.status === 'SUCCESS')
  const info = (f: (typeof exitosos)[number]): FulfillmentInfo => ({ id: f.id, delivered: f.displayStatus === 'DELIVERED' })

  const deMoovex = exitosos.filter(f => f.trackingInfo.some(t => t.company === TRACKING_COMPANY))
  if (deMoovex.length) return deMoovex.map(info)

  const abiertos = data.order.fulfillmentOrders.nodes
    .filter(fo => fo.supportedActions.some(a => a.action === 'CREATE_FULFILLMENT'))

  if (abiertos.length === 0) {
    // La tienda ya lo marcó preparado a mano: igual informamos la entrega sobre ese.
    if (exitosos.length) return exitosos.map(info)
    throw new Error('sin fulfillment orders que la app pueda preparar (¿lo despacha otra app, como Dropi?)')
  }

  const appUrl = process.env.APP_URL?.replace(/\/$/, '')
  const creados: FulfillmentInfo[] = []
  // Uno por fulfillment order: Shopify exige que cada fulfillment salga de una sola ubicación.
  for (const fo of abiertos) {
    const res = await shopifyGraphQL<{
      fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: { message: string }[] }
    }>(domain, token, `
      mutation ($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id }
          userErrors { message }
        }
      }`, {
      fulfillment: {
        lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id }],
        trackingInfo: {
          company: TRACKING_COMPANY,
          number:  order.orderNumber,
          ...(appUrl ? { url: `${appUrl}/track/${encodeURIComponent(order.qrCode)}` } : {}),
        },
        notifyCustomer: NOTIFY_CUSTOMER,
      },
    }, 'write_merchant_managed_fulfillment_orders')

    const err = res.fulfillmentCreate.userErrors[0]
    if (err || !res.fulfillmentCreate.fulfillment) throw new Error(`fulfillmentCreate: ${err?.message ?? 'sin respuesta'}`)
    creados.push({ id: res.fulfillmentCreate.fulfillment.id, delivered: false })
  }
  return creados
}

async function marcarEntregado(domain: string, token: string, fulfillmentId: string) {
  const res = await shopifyGraphQL<{
    fulfillmentEventCreate: { userErrors: { message: string }[] }
  }>(domain, token, `
    mutation ($event: FulfillmentEventInput!) {
      fulfillmentEventCreate(fulfillmentEvent: $event) {
        userErrors { message }
      }
    }`, {
    event: { fulfillmentId, status: 'DELIVERED', happenedAt: new Date().toISOString() },
  }, 'write_fulfillments')

  const err = res.fulfillmentEventCreate.userErrors[0]
  if (err) throw new Error(`fulfillmentEventCreate: ${err.message}`)
}
