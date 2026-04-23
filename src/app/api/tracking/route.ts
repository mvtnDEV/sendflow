export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/tracking?id=#SH-10482   (por número de pedido)
// GET /api/tracking?qr=sh_a3f9b2c1 (por código QR)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  const qr = searchParams.get('qr')

  if (!id && !qr) {
    return NextResponse.json({ ok: false, error: 'Parámetro id o qr requerido' }, { status: 400 })
  }

  const order = await prisma.order.findFirst({
    where: id
      ? { orderNumber: id }
      : { qrCode: qr! },
    select: {
      id:           true,
      orderNumber:  true,
      platform:     true,
      customerName: true,
      addressComuna: true,
      addressRegion: true,
      status:       true,
      bultos:       true,
      createdAt:    true,
      receivedAt:   true,
      inTransitAt:  true,
      deliveredAt:  true,
      store: { select: { name: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        select:  { status: true, note: true, createdAt: true },
      },
    },
  })

  if (!order) {
    return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  }

  // Solo exponer datos necesarios para el tracking público
  return NextResponse.json({
    ok: true,
    data: {
      orderNumber:  order.orderNumber,
      platform:     order.platform,
      storeName:    order.store.name,
      customerName: order.customerName,
      comuna:       order.addressComuna,
      region:       order.addressRegion,
      status:       order.status,
      bultos:       order.bultos,
      timeline: order.events.map(e => ({
        status:    e.status,
        note:      e.note,
        timestamp: e.createdAt,
      })),
    },
  })
}
