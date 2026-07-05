export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { audit } from '@/lib/services/audit.service'

interface DriverPayload {
  id:      string
  name:    string
  role:    string
  storeId: string | null
}

// ── Mismo sistema de verificación que batch-receive y evidence ──
// El token es base64 simple, NO JWT — usar jwt.verify causaba 401 silencioso
function verifyDriverToken(req: NextRequest): DriverPayload | null {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString())
    if (payload.exp < Date.now()) return null
    if (payload.role !== 'DRIVER') return null
    return payload as DriverPayload
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const driver = verifyDriverToken(req)
  if (!driver) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const today    = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const orders = await prisma.order.findMany({
    where: {
      AND: [
        // Solo pedidos donde este conductor tiene un evento (los escaneó o salió a ruta)
        {
          events: {
            some: {
              createdBy: driver.id,
            },
          },
        },
        // Solo pedidos activos de hoy o en camino actualmente
        {
          OR: [
            { status: { in: ['IN_TRANSIT', 'INCIDENT'] } },
            { inTransitAt: { gte: today, lt: tomorrow } },
            { deliveredAt: { gte: today, lt: tomorrow } },
          ],
        },
      ],
    },
    include: {
      store:  { select: { name: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ ok: true, data: orders })
}

export async function PATCH(req: NextRequest) {
  const driver = verifyDriverToken(req)
  if (!driver) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const { orderId, status, note } = await req.json().catch(() => ({}))
  if (!orderId || !status) {
    return NextResponse.json({ ok: false, error: 'orderId y status requeridos' }, { status: 400 })
  }

  const VALID = ['RECEIVED', 'IN_TRANSIT', 'DELIVERED', 'INCIDENT']
  if (!VALID.includes(status)) {
    return NextResponse.json({ ok: false, error: 'Estado inválido' }, { status: 400 })
  }

  const previous = await prisma.order.findUnique({
    where:  { id: orderId },
    select: { status: true },
  })
  const previousStatus = previous?.status ?? 'PENDING'

  const now   = new Date()
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(status === 'RECEIVED'   && { receivedAt:  now }),
      ...(status === 'IN_TRANSIT' && { inTransitAt: now }),
      ...(status === 'DELIVERED'  && { deliveredAt: now }),
      events: {
        create: {
          status,
          note:      note || defaultNote(status),
          createdBy: driver.id,
        },
      },
    },
  })

  try {
    const { notifyWebhooks } = await import('@/lib/services/webhook.service')
    await notifyWebhooks(orderId, status, String(previousStatus))
  } catch (err) {
    console.error('[Driver orders] Error notificando webhook:', err)
  }

  await audit({
    userId:   driver.id,
    action:   'UPDATE_ORDER_STATUS',
    resource: `order:${orderId}`,
    metadata: { status, driver: driver.name } as any,
  })

  return NextResponse.json({ ok: true, data: order })
}

function defaultNote(s: string): string {
  const m: Record<string, string> = {
    RECEIVED:   'Recepcionado en bodega',
    IN_TRANSIT: 'Salió a ruta',
    DELIVERED:  'Entregado al cliente',
    INCIDENT:   'Incidencia reportada',
  }
  return m[s] ?? s
}
