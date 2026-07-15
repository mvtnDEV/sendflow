export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const { orderIds } = await req.json().catch(() => ({}))
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'orderIds requerido' }, { status: 400 })
  }

  const now   = new Date()
  let updated = 0

  for (const orderId of orderIds) {
    try {
      const order = await prisma.order.findUnique({
        where:  { id: orderId },
        select: { id: true, status: true },
      })

      if (!order || order.status !== 'RECEIVED') continue

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status:      'IN_TRANSIT',
          inTransitAt: now,
          events: {
            create: {
              status:    'IN_TRANSIT',
              note:      'Salió a ruta — recepción masiva web',
              createdBy: user.id,
            },
          },
        },
      })

      // ── Notificar webhook a Senby ──
      try {
        const { notifyWebhooks } = await import('@/lib/services/webhook.service')
        await notifyWebhooks(orderId, 'IN_TRANSIT', 'RECEIVED')
      } catch (err) {
        console.error('[batch-in-transit] Error notificando webhook:', err)
      }

      updated++
    } catch (err) {
      console.error('[batch-in-transit] Error en pedido:', orderId, err)
    }
  }

  return NextResponse.json({ ok: true, updated })
}
