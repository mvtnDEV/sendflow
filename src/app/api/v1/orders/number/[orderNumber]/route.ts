export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyApiKey } from '@/lib/utils/api-auth'

export async function GET(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  const apiKey = await verifyApiKey(req)
  if (!apiKey) return NextResponse.json({ ok: false, error: 'API Key inválida o no enviada' }, { status: 401 })

  const num = params.orderNumber
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: num },
        { orderNumber: `#${num}` },
        { externalId: num },
      ]
    },
    include: { store: { select: { name: true } } },
  })

  if (!order) return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  if (apiKey.storeId && order.storeId !== apiKey.storeId) {
    return NextResponse.json({ ok: false, error: 'Sin acceso a este pedido' }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    data: {
      id:          order.id,
      orderNumber: order.orderNumber,
      externalId:  order.externalId,
      status:      order.status,
      storeName:   order.store.name,
      createdAt:   order.createdAt,
    }
  })
}
