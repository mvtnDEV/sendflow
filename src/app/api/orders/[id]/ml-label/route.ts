export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import { decrypt, encrypt } from '@/lib/utils/crypto'
import { refreshMLToken } from '@/lib/integrations/mercadolibre'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const order = await prisma.order.findUnique({
    where:  { id: params.id },
    select: { integrationId: true, rawPayload: true, platform: true, orderNumber: true },
  })

  if (!order) return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  if (order.platform !== 'MERCADOLIBRE') {
    return NextResponse.json({ ok: false, error: 'Solo disponible para pedidos ML Flex' }, { status: 400 })
  }
  if (!order.integrationId) {
    return NextResponse.json({ ok: false, error: 'Pedido sin integración ML' }, { status: 400 })
  }

  const shippingId = (order.rawPayload as any)?.shipping?.id
  if (!shippingId) {
    return NextResponse.json({ ok: false, error: 'Sin shipping.id en rawPayload' }, { status: 400 })
  }

  const integration = await prisma.storeIntegration.findUnique({ where: { id: order.integrationId } })
  if (!integration) {
    return NextResponse.json({ ok: false, error: 'Integración no encontrada' }, { status: 404 })
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

  async function fetchLabel(token: string) {
    return fetch(
      `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shippingId}&response_type=pdf`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache:   'no-store',
      },
    )
  }

  let res = await fetchLabel(accessToken)

  if (res.status === 401 || res.status === 403) {
    const refreshed = await refreshMLToken(refreshToken)
    await prisma.storeIntegration.update({
      where: { id: integration.id },
      data:  { apiKeyEnc: encrypt(`${refreshed.accessToken}|${refreshed.refreshToken}`) },
    })
    res = await fetchLabel(refreshed.accessToken)
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[ML label] Error descargando etiqueta:', shippingId, res.status, errText.slice(0, 300))

    // ── Caso específico: envíos gestionados por Fulfillment de ML ──
    // Estos no tienen etiqueta descargable por la vía pública de shipment_labels.
    if (errText.includes('INVALID_SHIPMENT_FF_PUBLIC') || errText.includes('is FF and call is public')) {
      return NextResponse.json({
        ok: false,
        error: 'Este envío es gestionado por Fulfillment de Mercado Libre (FF). La etiqueta no está disponible para descarga por esta vía — ML gestiona el despacho directamente desde su centro logístico.',
        code: 'FULFILLMENT_NOT_SUPPORTED',
      }, { status: 200 })
    }

    return NextResponse.json({ ok: false, error: `ML API ${res.status}`, detail: errText }, { status: 502 })
  }

  const pdfBuffer = await res.arrayBuffer()

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="etiqueta-flex-${order.orderNumber.replace('#', '')}.pdf"`,
    },
  })
}
