const API_BASE = 'https://api.enviosnow.cl/api/v1'

function getApiKey(): string {
  return process.env.ENVIOSNOW_API_KEY ?? ''
}

interface EnviosNowPayload {
  contactName:  string
  contactPhone: string
  externalId:   string
  pickupDate:   string
  address:      string
  commune:      string
}

interface EnviosNowResult {
  ok:      boolean
  id?:     string | number
  error?:  string
}

export async function createEnviosNowDelivery(
  payload:   EnviosNowPayload,
  timeoutMs: number = 10_000,
): Promise<EnviosNowResult> {
  try {
    // ── Log de diagnóstico — ver qué manda Moovex y qué responde Now ──
    console.log('[EnviosNow] Intentando crear envío:', JSON.stringify(payload))
    console.log('[EnviosNow] API Key presente:', !!getApiKey(), '| Key prefix:', getApiKey().slice(0, 8))

    const res = await fetch(`${API_BASE}/delivery`, {
      method:  'POST',
      headers: {
        'X-API-Key':    getApiKey(),
        'Content-Type': 'application/json',
      },
      body:   JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })

    const data = await res.json()
    // ── Log de respuesta completa ──
    console.log('[EnviosNow] Status HTTP:', res.status, '| Respuesta:', JSON.stringify(data))

    if (res.status === 201 || res.ok) {
      return { ok: true, id: data.id }
    }
    if (data.errorCode === 'DUPLICATE_EXTERNAL_ID') {
      return { ok: true, id: 'duplicate' }
    }
    return { ok: false, error: data.message ?? 'Error creando envío' }
  } catch (err: any) {
    console.error('[EnviosNow] Error de conexión:', err)
    return { ok: false, error: err.message }
  }
}

// ── Crear envíos en lote: pool de concurrencia + presupuesto global de tiempo ──
// Retorna solo los éxitos con id real (excluye 'duplicate'). Los fallos quedan
// como warn y se recuperan con el botón "Reenviar a Envios Now".
export async function createEnviosNowDeliveriesBatch(
  orders: Array<{ id: string } & Parameters<typeof toEnviosNowPayload>[0]>,
  opts?: { concurrency?: number; timeoutMs?: number; deadlineMs?: number },
): Promise<Array<{ orderId: string; externalId: string }>> {
  const { concurrency = 6, timeoutMs = 10_000, deadlineMs = 240_000 } = opts ?? {}
  const deadline = Date.now() + deadlineMs

  const { mapWithConcurrency } = await import('@/lib/utils/concurrency')
  const settled = await mapWithConcurrency(orders, concurrency, async order => {
    if (Date.now() > deadline) {
      console.warn(`[EnviosNow] Deadline del batch alcanzado — pedido ${order.id} queda pendiente`)
      return null
    }
    const result = await createEnviosNowDelivery(toEnviosNowPayload(order), timeoutMs)
    if (!result.ok) {
      console.warn(`[EnviosNow] No se pudo crear el envío del pedido ${order.id}:`, result.error)
      return null
    }
    if (!result.id || result.id === 'duplicate') return null
    return { orderId: order.id, externalId: String(result.id) }
  })

  return settled
    .filter((r): r is PromiseFulfilledResult<{ orderId: string; externalId: string } | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((v): v is { orderId: string; externalId: string } => v !== null)
}

export async function cancelEnviosNowDelivery(
  externalId: string
): Promise<EnviosNowResult> {
  try {
    const res = await fetch(`${API_BASE}/delivery/externalId/${encodeURIComponent(externalId)}`, {
      headers: { 'X-API-Key': getApiKey() },
    })
    const data = await res.json()
    if (!res.ok || !data.id) return { ok: false, error: 'No encontrado en Envios Now' }
    const cancelRes = await fetch(`${API_BASE}/delivery/${data.id}/cancel`, {
      method:  'PUT',
      headers: { 'X-API-Key': getApiKey() },
    })
    return { ok: cancelRes.ok }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export function toEnviosNowPayload(order: {
  orderNumber:   string
  customerName:  string
  customerPhone: string | null
  addressStreet: string
  addressComuna: string
  createdAt:     Date
}): EnviosNowPayload {
  const rawPhone = order.customerPhone?.replace(/\D/g, '') ?? ''
  const phone = rawPhone.startsWith('56')
    ? rawPhone.slice(2)
    : rawPhone.startsWith('9') && rawPhone.length === 9
    ? rawPhone
    : '912345678'

  const pickupDate = new Date().toISOString().split('T')[0]

  return {
    contactName:  order.customerName,
    contactPhone: phone,
    externalId:   order.orderNumber.replace('#', ''),
    pickupDate,
    address:      order.addressStreet,
    commune:      order.addressComuna,
  }
}
