export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { audit } from '@/lib/services/audit.service'
import jwt from 'jsonwebtoken'

interface DriverPayload {
  id:      string
  name:    string
  role:    string
  storeId: string | null
}

function verifyDriverToken(req: NextRequest): DriverPayload | null {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const payload = jwt.verify(auth.slice(7), process.env.NEXTAUTH_SECRET!) as DriverPayload
    if (payload.role !== 'DRIVER') return null
    return payload
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const driver = verifyDriverToken(req)
  if (!driver) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const today    = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // ── Traer pedidos activos del día ──
  // El problema era que no filtraba por conductor — traía TODOS los IN_TRANSIT
  // del sistema. La solución: filtrar por los pedidos donde el conductor
  // tiene un evento RECEIVED o IN_TRANSIT creado por él mismo (su driver.id).
  // Así cada conductor solo ve sus propios pedidos.
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

  // Leer estado anterior para el webhook
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

  // ── Notificar webhooks (Senby y otros) cuando el conductor cambia estado ──
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
