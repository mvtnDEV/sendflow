export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decrypt } from '@/lib/utils/crypto'
import { verifyWCWebhook, normalizeWCOrder } from '@/lib/integrations/woocommerce'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'

// POST /api/webhooks/woocommerce
export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const signature = req.headers.get('x-wc-webhook-signature') ?? ''
  const source    = req.headers.get('x-wc-webhook-source')   ?? ''
  const topic     = req.headers.get('x-wc-webhook-topic')    ?? ''

  if (!topic.startsWith('order.')) {
    return NextResponse.json({ ok: true, skipped: true })
  }


// Buscar integración por dominio — flexible para manejar trailing slash y variantes
const normalizeUrl = (url: string) => url.replace(/\/$/, '').toLowerCase()
const sourceNorm   = normalizeUrl(source)

const allIntegrations = await prisma.storeIntegration.findMany({
  where: { platform: 'WOOCOMMERCE', isActive: true },
})

const integration = allIntegrations.find(i =>
  i.externalStoreId && normalizeUrl(i.externalStoreId) === sourceNorm
)

if (!integration) {
  console.warn('[WC webhook] Integración no encontrada para source:', source)
  return NextResponse.json({ error: 'Integración no encontrada' }, { status: 404 })
}

  // Credenciales: "consumerKey|consumerSecret|webhookSecret"
  const creds  = decrypt(integration.apiKeyEnc)
  const [,,webhookSecret] = creds.split('|')

  const valid = verifyWCWebhook(rawBody, signature, webhookSecret)
  if (!valid) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  try {
    const payload    = JSON.parse(rawBody)
    const normalized = normalizeWCOrder(payload)

    await upsertOrderFromWebhook(integration.storeId, integration.id, normalized)
    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[WC webhook]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
