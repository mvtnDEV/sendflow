export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { generateLabelForOrder } from '@/lib/services/label.service'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })

  const order = await prisma.order.findUnique({
    where:  { id: params.id },
    select: { storeId: true },
  })
  if (!order) return new NextResponse('Pedido no encontrado', { status: 404 })
  if (!canAccessStore(user, order.storeId)) {
    return new NextResponse('Sin acceso', { status: 403 })
  }

  const format    = req.nextUrl.searchParams.get('format') ?? 'html'
  const allBultos = req.nextUrl.searchParams.get('allBultos') === '1'

  try {
    const { html, order: labelData } = await generateLabelForOrder(params.id, allBultos)

    if (format === 'json') {
      return NextResponse.json({ ok: true, data: labelData })
    }

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('[GET /api/labels]', err)
    return new NextResponse('Error generando etiqueta', { status: 500 })
  }
}
