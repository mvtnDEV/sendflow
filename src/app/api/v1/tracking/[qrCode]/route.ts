export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest, { params }: { params: { qrCode: string } }) {
  const q = params.qrCode.trim()

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { qrCode: q },
        { orderNumber: q },
        { orderNumber: `#${q}` },
        { externalId: q },
      ]
    },
    select: {
      orderNumber:  true,
      status:       true,
      customerName: true,
      addressComuna: true,
      addressRegion: true,
      bultos:       true,
      createdAt:    true,
      receivedAt:   true,
      inTransitAt:  true,
      deliveredAt:  true,
      evidencePhoto1: true,
      evidenceNote:   true,
      store: { select: { name: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        select:  { status: true, note: true, createdAt: true },
      },
    },
  })

  if (!order) return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    data: {
      orderNumber:   order.orderNumber,
      status:        order.status,
      customerName:  order.customerName,
      comuna:        order.addressComuna,
      region:        order.addressRegion,
      storeName:     order.store.name,
      bultos:        order.bultos,
      createdAt:     order.createdAt,
      receivedAt:    order.receivedAt,
      inTransitAt:   order.inTransitAt,
      deliveredAt:   order.deliveredAt,
      evidencePhoto: order.evidencePhoto1,
      evidenceNote:  order.evidenceNote,
      timeline:      order.events.map(e => ({ status: e.status, note: e.note, timestamp: e.createdAt })),
    }
  })
}
