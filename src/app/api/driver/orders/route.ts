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

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const orders = await prisma.order.findMany({
    where: {
      // ── Pedidos activos del conductor hoy ──
      // Antes filtraba por createdAt (fecha de creación del pedido),
      // pero un pedido puede haber sido creado días antes y recién hoy
      // pasar por bodega/ruta. Lo correcto es traer:
      //   a) lo que está en camino o con incidencia AHORA (sin importar cuándo se creó)
      //   b) lo que salió a ruta o se entregó/tuvo incidencia HOY
      OR: [
        { status: { in: ['IN_TRANSIT', 'INCIDENT'] } },
        { inTransitAt: { gte: today, lt: tomorrow } },
        { deliveredAt: { gte: today, lt: tomorrow } },
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
    RECEIVED:   'Recepcionado en bodega',
    IN_TRANSIT: 'Salió a ruta',
    DELIVERED:  'Entregado al cliente',
    INCIDENT:   'Incidencia reportada',
  }
  return m[s] ?? s
}
