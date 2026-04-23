import { prisma } from '@/lib/db/prisma'
import { decrypt } from '@/lib/utils/crypto'
import { fetchRecentJSOrders } from '@/lib/integrations/jumpseller'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'

/**
 * Servicio de sincronización periódica.
 * Llamado desde GET /api/sync (protegido por CRON_SECRET).
 * Shopify y WooCommerce usan webhooks → no necesitan polling.
 * ML Flex y Jumpseller se benefician de un polling adicional como respaldo.
 */
export async function syncAllIntegrations() {
  const integrations = await prisma.storeIntegration.findMany({
    where:   { isActive: true, platform: { in: ['JUMPSELLER'] } },
    include: { store: { select: { id: true } } },
  })

  const results = await Promise.allSettled(
    integrations.map(integration => syncIntegration(integration)),
  )

  return results.map((r, i) => ({
    integrationId: integrations[i].id,
    platform:      integrations[i].platform,
    ok:            r.status === 'fulfilled',
    error:         r.status === 'rejected' ? String(r.reason) : null,
  }))
}

async function syncIntegration(integration: {
  id: string; storeId: string; platform: string
  apiKeyEnc: string; lastSyncAt: Date | null
}) {
  const since   = integration.lastSyncAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
  const creds   = decrypt(integration.apiKeyEnc)
  let orders: Awaited<ReturnType<typeof fetchRecentJSOrders>> = []

  if (integration.platform === 'JUMPSELLER') {
    const [login, token] = creds.split('|')
    orders = await fetchRecentJSOrders(login, token, since)
  }

  let imported = 0
  let errors   = 0

  for (const order of orders) {
    try {
      await upsertOrderFromWebhook(integration.storeId, integration.id, order)
      imported++
    } catch {
      errors++
    }
  }

  await prisma.storeIntegration.update({
    where: { id: integration.id },
    data:  { lastSyncAt: new Date() },
  })

  await prisma.syncLog.create({
    data: {
      integrationId:  integration.id,
      ordersImported: imported,
      errors,
    },
  })
}
