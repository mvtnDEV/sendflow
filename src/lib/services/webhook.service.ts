import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

// ── Extraer "Recibió: X" desde evidenceNote ──
function extraerReceptor(evidenceNote: string | null): string | null {
  if (!evidenceNote) return null
  const match = evidenceNote.match(/Recibió:\s*([^·\n]+)/)
  return match ? match[1].trim() : null
}

// ── Extraer "RUT: X" desde evidenceNote ──
function extraerRut(evidenceNote: string | null): string | null {
  if (!evidenceNote) return null
  const match = evidenceNote.match(/RUT:\s*([^·\n]+)/)
  const rut = match ? match[1].trim() : null
  if (!rut || rut.length < 3) return null
  return rut
}

async function fetchOrdersForPayload(orderIds: string[]) {
  return prisma.order.findMany({
    where:   { id: { in: orderIds } },
    include: {
      store:  { select: { name: true } },
      events: { orderBy: { createdAt: 'asc' as const }, select: { status: true, note: true, createdAt: true, createdBy: true } },
    },
  })
}
type OrderForPayload = Awaited<ReturnType<typeof fetchOrdersForPayload>>[number]

function buildPayloadFromOrder(order: OrderForPayload, event: string, previousStatus: string) {

  const CREADORES_INTERNOS = ['system', 'webhook', 'ml-webhook', 'enviosnow-webhook', 'api', 'ml-cron-check']
  const NOTAS_INTERNAS     = ['envios now', 'enviame', 'enviosnow', 'now:', 'id now', 'delivery id']

  const timeline = order.events
    .filter(e => {
      if (CREADORES_INTERNOS.includes(e.createdBy ?? '')) return false
      if (e.note && NOTAS_INTERNAS.some(n => e.note!.toLowerCase().includes(n))) return false
      return true
    })
    .map(e => ({
      status:    e.status,
      timestamp: e.createdAt,
    }))

  return {
    event,
    previousStatus,
    data: {
      id:             order.id,
      orderNumber:    order.orderNumber,
      externalId:     order.externalId,
      sourceId:       null,
      subStoreName:   order.subStoreName,
      status:         order.status,
      customerName:   order.customerName,
      customerPhone:  order.customerPhone,
      customerEmail:  order.customerEmail,
      addressStreet:  order.addressStreet,
      addressComuna:  order.addressComuna,
      addressRegion:  order.addressRegion,
      addressNotes:   order.addressNotes,
      bultos:         order.bultos,
      storeName:      order.store.name,
      createdAt:      order.createdAt,
      receivedAt:     order.receivedAt,
      inTransitAt:    order.inTransitAt,
      deliveredAt:    order.deliveredAt,
      evidencePhoto:  order.evidencePhoto1,
      evidenceNote:   order.evidenceNote,
      // ── Extraer receptor y RUT desde evidenceNote si los campos están vacíos ──
      // Now guarda todo en evidenceNote — los campos separados quedan null
      receptorName:   (order as any).receptorName ?? extraerReceptor(order.evidenceNote),
      receptorRut:    (order as any).receptorRut  ?? extraerRut(order.evidenceNote),
      incidentReason: (order as any).incidentReason ?? null,
      timeline,
    },
  }
}

async function buildFullOrderPayload(orderId: string, event: string, previousStatus: string) {
  const [order] = await fetchOrdersForPayload([orderId])
  if (!order) return null
  return buildPayloadFromOrder(order, event, previousStatus)
}

const MAX_ATTEMPTS    = 3
const RETRY_DELAYS_MS = [0, 3000, 10000]

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
        'Content-Type':         'application/json',
        'X-SendFlow-Event':     event,
        'X-SendFlow-Timestamp': new Date().toISOString(),
        'X-SendFlow-Attempt':   String(attempt),
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
      statusCode   = res.status
      responseBody = (await res.text()).slice(0, 2000)
      success      = res.ok
      console.log(`[Webhook] Intento ${attempt}/${MAX_ATTEMPTS} → ${url} → ${statusCode}`)
    } catch (err: any) {
      errorMessage = err?.message ?? 'Error desconocido'
      console.error(`[Webhook] Intento ${attempt}/${MAX_ATTEMPTS} falló:`, errorMessage)
    }
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
      console.error('[Webhook] Error guardando log:', logErr)
    }
    if (success) return
  }
  console.error(`[Webhook] Se agotaron los ${MAX_ATTEMPTS} intentos para orderId=${orderId}`)
}

const recentNotifications = new Map<string, number>()

// ── Deduplicación en memoria: true si el mismo evento se envió hace <5s ──
function isDuplicateNotification(orderId: string, newStatus: string): boolean {
  const dedupeKey = `${orderId}:${newStatus}`
  const lastSent  = recentNotifications.get(dedupeKey)
  const now       = Date.now()

  if (lastSent && now - lastSent < 5000) {
    console.log(`[Webhook] Deduplicado — mismo evento enviado hace ${now - lastSent}ms: ${dedupeKey}`)
    return true
  }
  recentNotifications.set(dedupeKey, now)

  if (recentNotifications.size > 500) {
    const cutoff = now - 30000
    for (const [key, ts] of recentNotifications.entries()) {
      if (ts < cutoff) recentNotifications.delete(key)
    }
  }
  return false
}

export async function notifyWebhooks(
  orderId:        string,
  newStatus:      string,
  previousStatus: string,
) {
  if (isDuplicateNotification(orderId, newStatus)) return

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

// ── Versión batch: apiKeys en 1 query, payloads en 1 findMany y envíos
// (pedido × apiKey) en pool de concurrencia. Mismos reintentos y logging
// en webhook_events que la versión individual. ──
export async function notifyWebhooksBatch(
  updates:   Array<{ orderId: string; storeId: string; previousStatus: string }>,
  newStatus: string,
  opts?:     { concurrency?: number },
) {
  const pending = updates.filter(u => !isDuplicateNotification(u.orderId, newStatus))
  if (pending.length === 0) return

  const storeIds = Array.from(new Set(pending.map(u => u.storeId)))
  const apiKeys  = await prisma.apiKey.findMany({
    where: {
      isActive:   true,
      webhookUrl: { not: null },
      OR: [
        { storeId: { in: storeIds } },
        { storeId: null },
      ],
    },
    select: { id: true, storeId: true, webhookUrl: true, webhookSecret: true },
  })
  if (apiKeys.length === 0) return

  const orders   = await fetchOrdersForPayload(pending.map(u => u.orderId))
  const orderMap = new Map(orders.map(o => [o.id, o]))

  const tasks: Array<{ apiKey: (typeof apiKeys)[number]; orderId: string; payloadStr: string }> = []
  for (const update of pending) {
    const order = orderMap.get(update.orderId)
    if (!order) continue
    const keys = apiKeys.filter(ak => ak.webhookUrl && (ak.storeId === null || ak.storeId === order.storeId))
    if (keys.length === 0) continue
    const payloadStr = JSON.stringify(buildPayloadFromOrder(order, 'order.status_changed', update.previousStatus))
    for (const apiKey of keys) tasks.push({ apiKey, orderId: order.id, payloadStr })
  }
  if (tasks.length === 0) return

  const { mapWithConcurrency } = await import('@/lib/utils/concurrency')
  await mapWithConcurrency(tasks, opts?.concurrency ?? 10, t =>
    sendWebhookWithRetry(t.apiKey.id, t.orderId, t.apiKey.webhookUrl!, t.apiKey.webhookSecret ?? null, t.payloadStr, 'order.status_changed')
  )
}
