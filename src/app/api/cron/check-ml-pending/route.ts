export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { checkMLShipmentStatus } from '@/lib/integrations/mercadolibre-status'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const pendientes = await prisma.order.findMany({
    where: {
      platform: 'MERCADOLIBRE',
      pendingNowEvidence: { not: Prisma.JsonNull },
      status: { notIn: ['DELIVERED', 'CANCELLED'] },
    },
    select: { id: true, orderNumber: true, pendingNowEvidence: true },
  })

  console.log(`[Cron ML] Revisando ${pendientes.length} pedidos pendientes de confirmación ML`)

  const results = []

  for (const order of pendientes) {
    const mlCheck = await checkMLShipmentStatus(order.id)
    const now     = new Date()

    if (!mlCheck) {
      await prisma.order.update({ where: { id: order.id }, data: { pendingNowCheckedAt: now } })
      results.push({ orderNumber: order.orderNumber, status: 'no_response' })
      continue
    }

    if (mlCheck.isDelivered) {
      const pending = order.pendingNowEvidence as any
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status:      'DELIVERED',
          deliveredAt: now,
          ...(pending?.images?.[0] && { evidencePhoto1: pending.images[0] }),
          ...(pending?.images?.[1] && { evidencePhoto2: pending.images[1] }),
          evidenceNote: pending?.evidenceNote ?? null,
          pendingNowEvidence:  null,
          pendingNowCheckedAt: now,
          events: {
            create: {
              status:    'DELIVERED',
              note:      `ML Flex confirmó entrega · ${pending?.evidenceNote ?? ''}`,
              createdBy: 'ml-cron-check',
            },
          },
        },
      })
      console.log('[Cron ML] Confirmado y cerrado:', order.orderNumber)
      results.push({ orderNumber: order.orderNumber, status: 'closed_delivered' })
    } else if (mlCheck.isCancelled) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          pendingNowEvidence:  null,
          pendingNowCheckedAt: now,
          events: {
            create: {
              status:    'CANCELLED',
              note:      'ML Flex marcó el envío como cancelado',
              createdBy: 'ml-cron-check',
            },
          },
        },
      })
      results.push({ orderNumber: order.orderNumber, status: 'closed_cancelled' })
    } else {
      await prisma.order.update({ where: { id: order.id }, data: { pendingNowCheckedAt: now } })
      results.push({ orderNumber: order.orderNumber, status: 'still_waiting', mlStatus: mlCheck.shipmentStatus })
    }
  }

  return NextResponse.json({ ok: true, checked: pendientes.length, results })
}
