export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decrypt } from '@/lib/utils/crypto'
import { normalizeJSOrder } from '@/lib/integrations/jumpseller'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'

// POST /api/webhooks/jumpseller
// Jumpseller envía el payload completo del pedido directamente
// No tiene firma, se valida por token en query param
export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const storeToken = searchParams.get('token')

  if (!storeToken) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  // Buscar integración por token de webhook (guardado en webhookSecret)
  const integration = await prisma.storeIntegration.findFirst({
    where: {
      platform:      'JUMPSELLER',
      webhookSecret: storeToken,
      isActive:      true,
    },
  })

  if (!integration) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.order) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  // Solo procesar pedidos pagados
  const validStatuses = ['paid', 'pending_payment', 'processing']
  if (!validStatuses.includes(body.order.status)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    const normalized = normalizeJSOrder(body.order)
    await upsertOrderFromWebhook(integration.storeId, integration.id, normalized)
    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Jumpseller webhook]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
