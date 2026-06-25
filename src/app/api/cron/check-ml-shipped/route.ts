export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decrypt, encrypt } from '@/lib/utils/crypto'
import { refreshMLToken } from '@/lib/integrations/mercadolibre'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Solo pedidos ML Flex activos, que aún no tengamos confirmado el escaneo
  const pendientes = await prisma.order.findMany({
    where: {
      platform:    'MERCADOLIBRE',
      mlShippedAt: null,
      status:      { in: ['RECEIVED', 'IN_TRANSIT'] },
      integrationId: { not: null },
    },
    select: { id: true, orderNumber: true, integrationId: true, rawPayload: true },
  })

  console.log(`[Cron ML Shipped] Revisando ${pendientes.length} pedidos ML Flex sin confirmación de escaneo`)

  const results = []

  for (const order of pendientes) {
    const shippingId = (order.rawPayload as any)?.shipping?.id
    if (!shippingId || !order.integrationId) {
      results.push({ orderNumber: order.orderNumber, status: 'sin_shipping_id' })
      continue
    }

    try {
      const integration = await prisma.storeIntegration.findUnique({ where: { id: order.integrationId } })
      if (!integration) {
        results.push({ orderNumber: order.orderNumber, status: 'sin_integracion' })
        continue
      }

      const creds = decrypt(integration.apiKeyEnc)
      let accessToken: string
      let refreshToken: string

      if (creds.startsWith('{')) {
        const parsed = JSON.parse(creds)
        accessToken  = parsed.accessToken
        refreshToken = parsed.refreshToken
      } else {
        const [at, rt] = creds.split('|')
        accessToken  = at
        refreshToken = rt
      }

      async function fetchShipment(token: string) {
        return fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }

      let res = await fetchShipment(accessToken)

      if (res.status === 401 || res.status === 403) {
        const refreshed = await refreshMLToken(refreshToken)
        await prisma.storeIntegration.update({
          where: { id: integration.id },
          data:  { apiKeyEnc: encrypt(`${refreshed.accessToken}|${refreshed.refreshToken}`) },
        })
        res = await fetchShipment(refreshed.accessToken)
      }

      if (!res.ok) {
        results.push({ orderNumber: order.orderNumber, status: 'error_api', code: res.status })
        continue
      }

      const shipment   = await res.json()
      const dateShipped = shipment?.status_history?.date_shipped ?? null

      if (dateShipped) {
        await prisma.order.update({
          where: { id: order.id },
          data:  { mlShippedAt: new Date(dateShipped) },
        })
        console.log('[Cron ML Shipped] Confirmado escaneo Flex:', order.orderNumber, dateShipped)
        results.push({ orderNumber: order.orderNumber, status: 'shipped_confirmed', dateShipped })
      } else {
        results.push({ orderNumber: order.orderNumber, status: 'aun_no_escaneado' })
      }
    } catch (err: any) {
      console.error('[Cron ML Shipped] Error:', order.orderNumber, err.message)
      results.push({ orderNumber: order.orderNumber, status: 'error', message: err.message })
    }
  }

  return NextResponse.json({ ok: true, checked: pendientes.length, results })
}
