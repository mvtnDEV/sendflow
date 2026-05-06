import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'

interface WebhookPayload {
  event:          string
  orderNumber:    string
  externalId:     string | null
  status:         string
  previousStatus: string
  timestamp:      string
  evidencePhoto?: string | null
  evidenceNote?:  string | null
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export async function notifyWebhooks(
  orderId:        string,
  newStatus:      string,
  previousStatus: string,
) {
  const order = await prisma.order.findUnique({
    where:  { id: orderId },
    select: {
      orderNumber:    true,
      externalId:     true,
      storeId:        true,
      evidencePhoto1: true,
      evidenceNote:   true,
    },
  })

  if (!order) return

  // Buscar API Keys con webhookUrl configurado para esta tienda o globales
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      isActive:   true,
      webhookUrl: { not: null },
      OR: [
        { storeId: order.storeId },
        { storeId: null },
      ],
    },
    select: { webhookUrl: true, webhookSecret: true },
  })

  if (apiKeys.length === 0) return

  const payload: WebhookPayload = {
    event:          'order.status_changed',
    orderNumber:    order.orderNumber,
    externalId:     order.externalId,
    status:         newStatus,
    previousStatus,
    timestamp:      new Date().toISOString(),
    evidencePhoto:  order.evidencePhoto1,
    evidenceNote:   order.evidenceNote,
  }

  const payloadStr = JSON.stringify(payload)

  // Notificar a cada webhook en paralelo
  await Promise.allSettled(
    apiKeys.map(async (ak) => {
      if (!ak.webhookUrl) return
      try {
        const headers: Record<string, string> = {
          'Content-Type':    'application/json',
          'X-SendFlow-Event': 'order.status_changed',
          'X-SendFlow-Timestamp': new Date().toISOString(),
        }
        if (ak.webhookSecret) {
          headers['X-SendFlow-Signature'] = `sha256=${signPayload(payloadStr, ak.webhookSecret)}`
        }
        await fetch(ak.webhookUrl, {
          method:  'POST',
          headers,
          body:    payloadStr,
          signal:  AbortSignal.timeout(5000),
        })
        console.log('[Webhook] Notificado:', ak.webhookUrl, newStatus)
      } catch (err) {
        console.error('[Webhook] Error notificando:', ak.webhookUrl, err)
      }
    })
  )
}
