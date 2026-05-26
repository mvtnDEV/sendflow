const API_BASE = 'https://api.enviosnow.cl/api/v1'

function getApiKey(): string {
  return process.env.ENVIOSNOW_API_KEY ?? ''
}

interface EnviosNowPayload {
  contactName:  string
  contactPhone: string
  contactEmail?: string
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
  payload: EnviosNowPayload
): Promise<EnviosNowResult> {
  try {
    const res = await fetch(`${API_BASE}/delivery`, {
      method:  'POST',
      headers: {
        'X-API-Key':    getApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (res.status === 201 || res.ok) {
      return { ok: true, id: data.id }
    }
    if (data.errorCode === 'DUPLICATE_EXTERNAL_ID') {
      return { ok: true, id: 'duplicate' }
    }
    return { ok: false, error: data.message ?? 'Error creando envío' }
  } catch (err: any) {
    console.error('[EnviosNow] Error:', err)
    return { ok: false, error: err.message }
  }
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
  customerEmail: string | null
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

  const emailValido = order.customerEmail && /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,4}$/.test(order.customerEmail)
    ? order.customerEmail
    : undefined

  return {
    contactName:  order.customerName,
    contactPhone: phone,
    contactEmail: emailValido,
    externalId:   order.orderNumber.replace('#', ''),
    pickupDate,
    address:      order.addressStreet,
    commune:      order.addressComuna,
  }
}
