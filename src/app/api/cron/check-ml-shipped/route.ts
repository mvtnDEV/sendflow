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
    console.log('[Cron ML Shipped] >>> INICIO', order.orderNumber)

    try {
      const shippingId = (order.rawPayload as any)?.shipping?.id
      console.log('[Cron ML Shipped] shippingId:', order.orderNumber, '=', shippingId)

      if (!shippingId || !order.integrationId) {
        console.log('[Cron ML Shipped] SKIP sin_shipping_id:', order.orderNumber)
        results.push({ orderNumber: order.orderNumber, status: 'sin_shipping_id' })
        continue
      }

      const integration = await prisma.storeIntegration.findUnique({ where: { id: order.integrationId } })
      console.log('[Cron ML Shipped] integration encontrada:', order.orderNumber, !!integration)

      if (!integration) {
        results.push({ orderNumber: order.orderNumber, status: 'sin_integracion' })
        continue
      }

      const creds = decrypt(integration.apiKeyEnc)
      console.log('[Cron ML Shipped] creds desencriptadas OK:', order.orderNumber)

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

      console.log('[Cron ML Shipped] Llamando a ML API:', order.orderNumber, 'shipping:', shippingId)

      let res: Response
      try {
        res = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(8000), // ── timeout explícito, evita colgar todo el batch ──
        })
      } catch (fetchErr: any) {
        console.error('[Cron ML Shipped] Fetch falló (timeout/red):', order.orderNumber, fetchErr.message)
        results.push({ orderNumber: order.orderNumber, status: 'fetch_error', message: fetchErr.message })
        continue
      }

      console.log('[Cron ML Shipped] Respuesta ML:', order.orderNumber, 'status:', res.status)

      if (res.status === 401 || res.status === 403) {
        console.log('[Cron ML Shipped] Token expirado, refrescando:', order.orderNumber)
        try {
          const refreshed = await refreshMLToken(refreshToken)
          await prisma.storeIntegration.update({
            where: { id: integration.id },
            data:  { apiKeyEnc: encrypt(`${refreshed.accessToken}|${refreshed.refreshToken}`) },
          })
          res = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
            headers: { Authorization: `Bearer ${refreshed.accessToken}` },
            signal: AbortSignal.timeout(8000),
          })
          console.log('[Cron ML Shipped] Respuesta tras refresh:', order.orderNumber, 'status:', res.status)
        } catch (refreshErr: any) {
          console.error('[Cron ML Shipped] Refresh token falló:', order.orderNumber, refreshErr.message)
          results.push({ orderNumber: order.orderNumber, status: 'refresh_error', message: refreshErr.message })
          continue
        }
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.log('[Cron ML Shipped] Error API ML:', order.orderNumber, res.status, errBody.slice(0, 200))
        results.push({ orderNumber: order.orderNumber, status: 'error_api', code: res.status })
        continue
      }

      const shipment    = await res.json()
      const dateShipped = shipment?.status_history?.date_shipped ?? null
      console.log('[Cron ML Shipped] date_shipped:', order.orderNumber, dateShipped)

      if (dateShipped) {
        await prisma.order.update({
          where: { id: order.id },
          data:  { mlShippedAt: new Date(dateShipped) },
        })
        console.log('[Cron ML Shipped] ✅ Confirmado escaneo Flex:', order.orderNumber, dateShipped)
        results.push({ orderNumber: order.orderNumber, status: 'shipped_confirmed', dateShipped })
      } else {
        console.log('[Cron ML Shipped] Aún no escaneado:', order.orderNumber)
        results.push({ orderNumber: order.orderNumber, status: 'aun_no_escaneado' })
      }
    } catch (err: any) {
      console.error('[Cron ML Shipped] ❌ Error inesperado:', order.orderNumber, err?.message, err?.stack)
      results.push({ orderNumber: order.orderNumber, status: 'error', message: err?.message })
    }

    console.log('[Cron ML Shipped] >>> FIN', order.orderNumber)
  }

  console.log('[Cron ML Shipped] Terminado. Total procesados:', results.length)

  return NextResponse.json({ ok: true, checked: pendientes.length, results })
}
