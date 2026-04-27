export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

const TZ = 'America/Santiago'

function fmt(d: Date | null): string | null {
  if (!d) return null
  return new Date(d).toLocaleString('es-CL', {
    timeZone: TZ, day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q  = searchParams.get('q')?.trim()
  const id = searchParams.get('id')?.trim()
  const qr = searchParams.get('qr')?.trim()

  // Acepta ?q=, ?id= o ?qr=
  const search = q || id || qr

  if (!search) {
    return NextResponse.json({ ok: false, error: 'Parámetro requerido: q, id o qr' }, { status: 400 })
  }

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: search },
        { orderNumber: `#${search}` },
        { qrCode: search },
      ]
    },
    select: {
      id:            true,
      orderNumber:   true,
      platform:      true,
      customerName:  true,
      addressStreet: true,
      addressComuna: true,
      addressRegion: true,
      status:        true,
      bultos:        true,
      createdAt:     true,
      receivedAt:    true,
      inTransitAt:   true,
      deliveredAt:   true,
      evidencePhoto1: true,
      evidencePhoto2: true,
      evidenceNote:   true,
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

  return NextResponse.json({
    ok: true,
    data: {
      orderNumber:   order.orderNumber,
      platform:      order.platform,
      storeName:     order.store.name,
      customerName:  order.customerName,
      address:       `${order.addressStreet}, ${order.addressComuna}`,
      comuna:        order.addressComuna,
      region:        order.addressRegion,
      status:        order.status,
      bultos:        order.bultos,
      createdAt:     fmt(order.createdAt),
      receivedAt:    fmt(order.receivedAt),
      inTransitAt:   fmt(order.inTransitAt),
      deliveredAt:   fmt(order.deliveredAt),
      evidencePhoto1: order.evidencePhoto1 || null,
      evidencePhoto2: order.evidencePhoto2 || null,
      evidenceNote:   order.evidenceNote   || null,
      timeline: order.events.map(e => ({
        status:    e.status,
        note:      e.note,
        timestamp: e.createdAt,
        formatted: fmt(e.createdAt),
      })),
    },
  })
}
