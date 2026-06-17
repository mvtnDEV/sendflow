import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

// ── Construye el mismo payload completo que devuelve GET /api/v1/orders/:id ──
async function buildFullOrderPayload(orderId: string, event: string, previousStatus: string) {
  const order = await prisma.order.findUnique({
    where:   { id: orderId },
    include: {
      store:  { select: { name: true } },
      events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
    },
  })
  if (!order) return null

  return {
    event,
    previousStatus,
    data: {
      id:            order.id,
      orderNumber:   order.orderNumber,
      externalId:    order.externalId,
      sourceId:      order.sourceId,
      subStoreName:  order.subStoreName,
      status:        order.status,
      customerName:  order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      addressStreet: order.addressStreet,
      addressComuna: order.addressComuna,
      addressRegion: order.addressRegion,
      addressNotes:  order.addressNotes,
      bultos:        order.bultos,
      storeName:     order.store.name,
      createdAt:     order.createdAt,
      receivedAt:    order.receivedAt,
      inTransitAt:   order.inTransitAt,
      deliveredAt:   order.deliveredAt,
      evidencePhoto: order.evidencePhoto1,
      evidenceNote:  order.evidenceNote,
      timeline:      order.events.map(e => ({
        status:    e.status,
        note:      e.note,
        timestamp: e.createdAt,
      })),
    },
  }
}

const MAX_ATTEMPTS    = 3
const RETRY_DELAYS_MS = [0, 3000, 10000] // inmediato, +3s, +10s

async function sendWebhookWithRetry(
  apiKeyId:   string,
  orderId:    string,
  url:        string,
  secret:     string | null,
  payloadStr: string,
  event:      string,
) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (RETRY_DELAYS_MS[attempt - 1] > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
    }

    let statusCode: number | null = null
    let responseBody = ''
    let success = false
    let errorMessage: string | null = null

    try {
      const headers: Record<string, string> = {
        'Content-Type':          'application/json',
        'X-SendFlow-Event':      event,
        'X-SendFlow-Timestamp':  new Date().toISOString(),
        'X-SendFlow-Attempt':    String(attempt),
      }
      if (secret) {
        headers['X-SendFlow-Signature'] = `sha256=${signPayload(payloadStr, secret)}`
      }

      const res = await fetch(url, {
        method:  'POST',
        headers,
        body:    payloadStr,
        signal:  AbortSignal.timeout(8000),
      })

      statusCode = res.status
      responseBody = (await res.text()).slice(0, 2000) // truncar por si responde algo enorme
      success = res.ok

      console.log(`[Webhook] Intento ${attempt}/${MAX_ATTEMPTS} → ${url} → ${statusCode}`)
    } catch (err: any) {
      errorMessage = err?.message ?? 'Error desconocido'
      console.error(`[Webhook] Intento ${attempt}/${MAX_ATTEMPTS} falló:`, errorMessage)
    }

    // Registrar el intento en la DB siempre, exitoso o no
    try {
      await prisma.webhookEvent.create({
        data: {
          apiKeyId,
          orderId,
          event,
          url,
          payload:      JSON.parse(payloadStr),
          statusCode:   statusCode ?? undefined,
          responseBody: responseBody || undefined,
          success,
          attempt,
          errorMessage: errorMessage ?? undefined,
        },
      })
    } catch (logErr) {
      console.error('[Webhook] Error guardando log de webhook:', logErr)
    }

    if (success) return // listo, no reintentar más
  }

  console.error(`[Webhook] Se agotaron los ${MAX_ATTEMPTS} intentos para orderId=${orderId} url=${url}`)
}

export async function notifyWebhooks(
  orderId:        string,
  newStatus:      string,
  previousStatus: string,
) {
  const order = await prisma.order.findUnique({
    where:  { id: orderId },
    select: { storeId: true },
  })
  if (!order) return

  const apiKeys = await prisma.apiKey.findMany({
    where: {
      isActive:   true,
      webhookUrl: { not: null },
      OR: [
        { storeId: order.storeId },
        { storeId: null },
      ],
    },
    select: { id: true, webhookUrl: true, webhookSecret: true },
  })
  if (apiKeys.length === 0) return

  const fullPayload = await buildFullOrderPayload(orderId, 'order.status_changed', previousStatus)
  if (!fullPayload) return

  const payloadStr = JSON.stringify(fullPayload)

  await Promise.allSettled(
    apiKeys.map(ak => {
      if (!ak.webhookUrl) return Promise.resolve()
      return sendWebhookWithRetry(ak.id, orderId, ak.webhookUrl, ak.webhookSecret ?? null, payloadStr, 'order.status_changed')
    })
  )
}
