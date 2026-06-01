export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { normalizeJSOrder } from '@/lib/integrations/jumpseller'
import { upsertOrderFromWebhook } from '@/lib/services/order.service'



// GET — verificación de URL por Jumpseller
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, status: 'webhook activo' })
}

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const storeToken = searchParams.get('token')

  if (!storeToken) {
    console.warn('[Jumpseller webhook] Sin token en query param')
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  // Buscar integración por token de webhook (guardado en webhookSecret)
  const integration = await prisma.storeIntegration.findFirst({
    where: {
      platform:  'JUMPSELLER',
      isActive:  true,
    },
  })

  if (!integration) {
    console.warn('[Jumpseller webhook] Integración no encontrada')
    return NextResponse.json({ error: 'Integración no encontrada' }, { status: 404 })
  }

  // Verificar token — modo debug: solo warn, no bloquea
  if (integration.webhookSecret && integration.webhookSecret !== storeToken) {
    console.warn('[Jumpseller webhook] Token inválido — continuando en modo debug')
  }

  const body = await req.json().catch(() => null)
  if (!body?.order) {
    console.warn('[Jumpseller webhook] Payload inválido:', body)
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  console.log('[Jumpseller webhook] Pedido recibido COMPLETO:', JSON.stringify(body.order, null, 2))

  // Solo procesar pedidos pagados
  const validStatuses = ['paid', 'pending_payment', 'processing']
  if (!validStatuses.includes(body.order.status)) {
    console.log(`[Jumpseller webhook] Estado ignorado: ${body.order.status}`)
    return NextResponse.json({ ok: true, skipped: true })
  }

  try {
    const normalized = normalizeJSOrder(body.order)
    await upsertOrderFromWebhook(integration.storeId, integration.id, normalized)
    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { lastSyncAt: new Date() },
    })
    console.log(`[Jumpseller webhook] Pedido ${normalized.externalId} procesado OK`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Jumpseller webhook]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
