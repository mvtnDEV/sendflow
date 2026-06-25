export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import { decrypt, encrypt } from '@/lib/utils/crypto'
import { refreshMLToken } from '@/lib/integrations/mercadolibre'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const orderNumberParam = req.nextUrl.searchParams.get('orderNumber')
  const idParam          = req.nextUrl.searchParams.get('id')

  if (!orderNumberParam && !idParam) {
    return NextResponse.json({ ok: false, error: 'Falta orderNumber o id' }, { status: 400 })
  }

  // Acepta el número con o sin "#" — intenta ambas variantes
  const candidates = orderNumberParam
    ? [orderNumberParam, `#${orderNumberParam.replace(/^#/, '')}`, orderNumberParam.replace(/^#/, '')]
    : []

  const order = await prisma.order.findFirst({
    where: idParam
      ? { id: idParam }
      : { orderNumber: { in: candidates } },
    select: { id: true, orderNumber: true, status: true, integrationId: true, rawPayload: true },
  })

  if (!order) return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  if (!order.integrationId) return NextResponse.json({ ok: false, error: 'Pedido sin integración ML' }, { status: 400 })

  const shippingId = (order.rawPayload as any)?.shipping?.id
  if (!shippingId) return NextResponse.json({ ok: false, error: 'Sin shipping.id en rawPayload' }, { status: 400 })

  const integration = await prisma.storeIntegration.findUnique({ where: { id: order.integrationId } })
  if (!integration) return NextResponse.json({ ok: false, error: 'Integración no encontrada' }, { status: 404 })

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
    const errText = await res.text()
    return NextResponse.json({ ok: false, error: `ML API ${res.status}`, detail: errText }, { status: 502 })
  }

  const shipment = await res.json()

  return NextResponse.json({
    ok: true,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    shippingId,
    mlStatus:    shipment?.status ?? null,
    mlSubstatus: shipment?.substatus ?? null,
    mlFull:      shipment,
  })
}
