import type { NormalizedOrder } from '@/types'

/**
 * Integración Shopify.
 *
 * Desde 2026 Shopify ya no permite crear apps en "Develop apps" del admin:
 * la tienda crea una app en el Dev Dashboard (misma organización que la tienda)
 * y nos entrega Client ID + Client secret. Con eso:
 *   - pedimos un access token (client credentials grant, dura 24 h)
 *   - registramos los webhooks por API
 *   - verificamos la firma de cada webhook con el mismo Client secret
 */

export const SHOPIFY_API_VERSION = '2026-07'

// Shopify despacha un aviso por cada uno de estos eventos.
export const SHOPIFY_WEBHOOK_TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_CANCELLED'] as const

/** Error con mensaje listo para mostrar a la tienda. */
export class ShopifyError extends Error {}

/**
 * Acepta lo que la tienda pegue: "mi-tienda", "mi-tienda.myshopify.com",
 * "https://mi-tienda.myshopify.com/" o "admin.shopify.com/store/mi-tienda".
 */
export function normalizeShopDomain(input: string): string | null {
  let s = input.trim().toLowerCase()
  const admin = s.match(/admin\.shopify\.com\/store\/([a-z0-9-]+)/)
  if (admin) s = admin[1]
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!s.includes('.')) s = `${s}.myshopify.com`
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null
}

// ─── Access token ────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; scopes: string[]; expiresAt: number }>()

export async function getShopifyAccessToken(
  domain: string, clientId: string, clientSecret: string,
): Promise<{ token: string; scopes: string[] }> {
  const key    = `${domain}:${clientId}`
  const cached = tokenCache.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached

  let res: Response
  try {
    res = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
      cache:   'no-store',
    })
  } catch {
    throw new ShopifyError(`No pudimos contactar ${domain}. Revisa que el dominio esté bien escrito.`)
  }

  const text = await res.text()
  if (!res.ok) {
    if (res.status === 404) {
      throw new ShopifyError(`No existe una tienda Shopify en ${domain}. Revisa el dominio .myshopify.com.`)
    }
    if (text.includes('shop_not_permitted')) {
      throw new ShopifyError(
        'La app no pertenece a esta tienda. Debe crearse en el Dev Dashboard con la misma cuenta dueña de la tienda, e instalarse en ella.',
      )
    }
    if (res.status === 400 || res.status === 401 || text.includes('invalid_client')) {
      throw new ShopifyError('Client ID o Client secret incorrectos. Cópialos de nuevo desde la app en el Dev Dashboard.')
    }
    throw new ShopifyError(`Shopify respondió un error (${res.status}). Intenta de nuevo en unos minutos.`)
  }

  const data   = JSON.parse(text) as { access_token: string; scope?: string; expires_in?: number }
  const entry  = {
    token:     data.access_token,
    scopes:    (data.scope ?? '').split(',').map(s => s.trim()).filter(Boolean),
    expiresAt: Date.now() + (data.expires_in ?? 86_399) * 1000,
  }
  tokenCache.set(key, entry)
  return entry
}

/** `scopeHint`: permiso que se le pide a la tienda si Shopify responde "access denied". */
export async function shopifyGraphQL<T>(
  domain: string, token: string, query: string, variables?: object, scopeHint = 'read_orders',
): Promise<T> {
  const res = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body:    JSON.stringify({ query, variables }),
    cache:   'no-store',
  })
  if (!res.ok) throw new ShopifyError(`Shopify respondió un error (${res.status}) al consultar la API.`)
  const json = await res.json()
  if (json.errors?.length) {
    const msg = String(json.errors[0]?.message ?? '')
    if (/access denied|scope/i.test(msg)) {
      throw new ShopifyError(`A la app le faltan permisos. Activa el permiso ${scopeHint} en el Dev Dashboard y vuelve a instalarla.`)
    }
    throw new ShopifyError(`Error de Shopify: ${msg}`)
  }
  return json.data as T
}

// ─── Conexión ────────────────────────────────────────────────────────────────

/** Valida credenciales y permisos. Devuelve el nombre de la tienda. */
export async function testShopifyConnection(domain: string, clientId: string, clientSecret: string) {
  const { token, scopes } = await getShopifyAccessToken(domain, clientId, clientSecret)
  if (scopes.length && !scopes.some(s => s === 'read_orders' || s === 'write_orders')) {
    throw new ShopifyError('A la app le falta el permiso read_orders. Agrégalo en el Dev Dashboard, publica una versión nueva y apruébala en la tienda.')
  }
  const data = await shopifyGraphQL<{ shop: { name: string } }>(domain, token, '{ shop { name } }')
  return { token, shopName: data.shop.name }
}

/**
 * Crea los webhooks de pedidos apuntando a `callbackUrl`. Idempotente: si ya
 * existen con esa URL no los duplica, así que se puede reconectar sin miedo.
 */
export async function registerShopifyWebhooks(domain: string, token: string, callbackUrl: string) {
  const existing = await shopifyGraphQL<{
    webhookSubscriptions: { nodes: { topic: string; uri: string }[] }
  }>(domain, token, `{ webhookSubscriptions(first: 100) { nodes { topic uri } } }`)

  const yaRegistrados = new Set(
    existing.webhookSubscriptions.nodes.filter(n => n.uri === callbackUrl).map(n => n.topic),
  )

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    if (yaRegistrados.has(topic)) continue
    const res = await shopifyGraphQL<{
      webhookSubscriptionCreate: { userErrors: { message: string }[] }
    }>(domain, token, `
      mutation ($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
          userErrors { message }
        }
      }`, { topic, sub: { uri: callbackUrl, format: 'JSON' } })
    const err = res.webhookSubscriptionCreate.userErrors[0]
    if (err) throw new ShopifyError(`No pudimos crear el webhook ${topic}: ${err.message}`)
  }
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

/** Shopify manda la región en inglés ("Santiago Metropolitan"); el código RM es estable. */
function regionChilena(addr: any): string {
  if (String(addr.province_code ?? '').toUpperCase() === 'RM') return 'Región Metropolitana'
  return addr.province || ''
}

/** null si el pedido no tiene dirección de envío (retiro en tienda, productos digitales). */
export function normalizeShopifyOrder(payload: any): NormalizedOrder | null {
  const addr = payload.shipping_address
  if (!addr) return null

  const nombre = [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(' ')
    || addr.name
    || [addr.first_name, addr.last_name].filter(Boolean).join(' ')
    || 'Sin nombre'

  return {
    externalId:    String(payload.id),
    platform:      'SHOPIFY',
    customerName:  nombre,
    customerPhone: addr.phone || payload.customer?.phone || payload.phone || '',
    customerEmail: payload.customer?.email || payload.email || '',
    addressStreet: [addr.address1, addr.address2].filter(Boolean).join(' '),
    addressComuna: addr.city || '',
    addressRegion: regionChilena(addr),
    // Mismo criterio que antes (una línea = un bulto), sin contar lo que no se despacha.
    bultos:        Math.max(1, (payload.line_items ?? []).filter((i: any) => i.requires_shipping !== false).length),
    rawPayload:    payload as any,
  }
}
