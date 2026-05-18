export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decrypt } from '@/lib/utils/crypto'
import { fetchMLOrder, extractMLOrderId, refreshMLToken } from '@/lib/integrations/mercadolibre'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'

// POST /api/webhooks/mercadolibre
// ML envía una notificación con el resource path, luego hay que ir a buscar el pedido
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  // Solo procesar notificaciones de pedidos
   console.log('[ML webhook] body:', JSON.stringify(body))
  if (body.topic !== 'orders_v2') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const orderId = extractMLOrderId(body.resource)
  if (!orderId) {
    return NextResponse.json({ error: 'resource inválido' }, { status: 400 })
  }

  // Identificar la integración por user_id de ML
  const integration = await prisma.storeIntegration.findFirst({
    where: {
      platform:        'MERCADOLIBRE',
      externalStoreId: String(body.user_id),
      isActive:        true,
    },
  })

  if (!integration) {
    return NextResponse.json({ error: 'Integración no encontrada' }, { status: 404 })
  }

  try {
    // Las credenciales son: "accessToken|refreshToken" cifrado
    const creds        = decrypt(integration.apiKeyEnc)
    const [accessToken, refreshToken] = creds.split('|')

    let token = accessToken
    let normalized

    try {
      normalized = await fetchMLOrder(orderId, token)
    } catch (err: any) {
      // Si el token expiró (6h), hacer refresh y reintentar
      if (err.message?.includes('401')) {
        const refreshed = await refreshMLToken(refreshToken)
        token      = refreshed.accessToken

        // Actualizar token en la DB cifrado
        const { encrypt } = await import('@/lib/utils/crypto')
        await prisma.storeIntegration.update({
          where: { id: integration.id },
          data:  { apiKeyEnc: encrypt(`${refreshed.accessToken}|${refreshed.refreshToken}`) },
        })

        normalized = await fetchMLOrder(orderId, token)
      } else {
        throw err
      }
    }

    await upsertOrderFromWebhook(integration.storeId, integration.id, normalized)
    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[ML webhook]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
