import { prisma } from '@/lib/db/prisma'
import { decrypt, encrypt } from '@/lib/utils/crypto'
import { refreshMLToken } from '@/lib/integrations/mercadolibre'

interface MLShipmentCheck {
  isDelivered:    boolean
  isCancelled:    boolean
  shipmentStatus: string | null
}

// ── Consulta el estado real del envío en ML Flex usando el shipping.id guardado en rawPayload ──
export async function checkMLShipmentStatus(orderId: string): Promise<MLShipmentCheck | null> {
  const order = await prisma.order.findUnique({
    where:  { id: orderId },
    select: { integrationId: true, rawPayload: true },
  })

  if (!order?.integrationId) return null

  const shippingId = (order.rawPayload as any)?.shipping?.id
  if (!shippingId) {
    console.log('[ML check] Pedido sin shipping.id en rawPayload:', orderId)
    return null
  }

  const integration = await prisma.storeIntegration.findUnique({
    where: { id: order.integrationId },
  })
  if (!integration) return null

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
    console.error('[ML check] Error consultando shipment:', shippingId, res.status)
    return null
  }

  const shipment = await res.json()
  const status   = shipment?.status ?? null

  return {
    isDelivered:    status === 'delivered',
    isCancelled:    status === 'cancelled',
    shipmentStatus: status,
  }
}
