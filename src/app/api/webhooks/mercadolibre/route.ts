export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decrypt, encrypt } from '@/lib/utils/crypto'
import { fetchMLOrder, extractMLOrderId, refreshMLToken } from '@/lib/integrations/mercadolibre'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  console.log('[ML webhook] body:', JSON.stringify(body))

  if (body.topic !== 'orders_v2') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const orderId = extractMLOrderId(body.resource)
  if (!orderId) {
    return NextResponse.json({ error: 'resource inválido' }, { status: 400 })
  }

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

    let token = accessToken
    let normalized

    try {
      normalized = await fetchMLOrder(orderId, token)
    } catch (err: any) {
      // Pedido sin despacho a domicilio — ignorar silenciosamente
      if (err.message?.includes('sin despacho')) {
        console.log('[ML webhook] Pedido sin despacho, ignorando:', orderId)
        return NextResponse.json({ ok: true, skipped: true })
      }
      // Token expirado — hacer refresh y reintentar
      if (err.message?.includes('401') || err.message?.includes('403')) {
        console.log('[ML webhook] Token expirado, haciendo refresh...')
        const refreshed = await refreshMLToken(refreshToken)
        token = refreshed.accessToken
        await prisma.storeIntegration.update({
          where: { id: integration.id },
          data:  { apiKeyEnc: encrypt(`${refreshed.accessToken}|${refreshed.refreshToken}`) },
        })
        normalized = await fetchMLOrder(orderId, token)
        // Si después del refresh también es sin despacho
        if (!normalized) return NextResponse.json({ ok: true, skipped: true })
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
  } catch (err: any) {
    // Capturar error de sin despacho que puede venir del segundo intento
    if (err.message?.includes('sin despacho')) {
      console.log('[ML webhook] Pedido sin despacho (post-refresh), ignorando:', orderId)
      return NextResponse.json({ ok: true, skipped: true })
    }
    console.error('[ML webhook]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
