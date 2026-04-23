export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { audit } from '@/lib/services/audit.service'

// Verificar token del conductor (simple base64 para demo — en prod usar JWT firmado)
function verifyDriverToken(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString())
    if (payload.exp < Date.now()) return null
    if (payload.role !== 'DRIVER') return null
    return payload as { id: string; name: string; storeId: string | null }
  } catch { return null }
}

// GET /api/driver/orders — pedidos activos del día para el conductor
export async function GET(req: NextRequest) {
  const driver = verifyDriverToken(req)
  if (!driver) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: today },
      status:    { notIn: ['CANCELLED'] },
      OR: [
        { evidenceTakenBy: null },
        { evidenceTakenBy: driver.id },
        { status: { in: ['PENDING', 'RECEIVED', 'IN_TRANSIT', 'INCIDENT'] } },
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

// PATCH /api/driver/orders — actualizar estado desde la app del conductor
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
    RECEIVED: 'Recepcionado en bodega', IN_TRANSIT: 'Salió a ruta',
    DELIVERED: 'Entregado al cliente', INCIDENT: 'Incidencia reportada',
  }
  return m[s] ?? s
}
