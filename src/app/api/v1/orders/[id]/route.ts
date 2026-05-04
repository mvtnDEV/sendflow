export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyApiKey } from '@/lib/utils/api-auth'
import { updateOrderStatus } from '@/lib/services/order.service'
import type { OrderStatus } from '@prisma/client'

const VALID_STATUSES = ['RECEIVED', 'IN_TRANSIT', 'DELIVERED', 'INCIDENT', 'CANCELLED']

// GET /api/v1/orders/:id
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const apiKey = await verifyApiKey(req)
  if (!apiKey) return NextResponse.json({ ok: false, error: 'API Key inválida o no enviada' }, { status: 401 })

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      store:  { select: { name: true } },
      events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
    },
  })

  if (!order) return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  if (apiKey.storeId && order.storeId !== apiKey.storeId) {
    return NextResponse.json({ ok: false, error: 'Sin acceso a este pedido' }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    data: {
      id:             order.id,
      orderNumber:    order.orderNumber,
      externalId:     order.externalId,
      status:         order.status,
      customerName:   order.customerName,
      customerPhone:  order.customerPhone,
      customerEmail:  order.customerEmail,
      addressStreet:  order.addressStreet,
      addressComuna:  order.addressComuna,
      addressRegion:  order.addressRegion,
      addressNotes:   order.addressNotes,
      bultos:         order.bultos,
      storeName:      order.store.name,
      createdAt:      order.createdAt,
      receivedAt:     order.receivedAt,
      inTransitAt:    order.inTransitAt,
      deliveredAt:    order.deliveredAt,
      evidencePhoto:  order.evidencePhoto1,
      evidenceNote:   order.evidenceNote,
      timeline:       order.events.map(e => ({ status: e.status, note: e.note, timestamp: e.createdAt })),
    }
  })
}

// PATCH /api/v1/orders/:id
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const apiKey = await verifyApiKey(req)
  if (!apiKey) return NextResponse.json({ ok: false, error: 'API Key inválida o no enviada' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.status) return NextResponse.json({ ok: false, error: 'status es requerido' }, { status: 400 })

  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ ok: false, error: `Estado inválido. Debe ser uno de: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const order = await prisma.order.findUnique({ where: { id: params.id } })
  if (!order) return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  if (apiKey.storeId && order.storeId !== apiKey.storeId) {
    return NextResponse.json({ ok: false, error: 'Sin acceso a este pedido' }, { status: 403 })
  }

  const updated = await updateOrderStatus(params.id, body.status as OrderStatus, body.note, 'api')

  return NextResponse.json({ ok: true, data: { id: updated.id, orderNumber: updated.orderNumber, status: updated.status } })
}
