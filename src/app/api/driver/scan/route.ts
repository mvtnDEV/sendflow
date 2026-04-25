export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ ok: false, error: 'Parámetro q requerido' }, { status: 400 })

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { id:          q },
        { qrCode:      q },
        { orderNumber: q },
      ],
    },
    include: {
      store:  { select: { id: true, name: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!order) return NextResponse.json({ ok: false, error: 'Pedido no encontrado', code: q }, { status: 404 })

  return NextResponse.json({ ok: true, data: order })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  })
}
