export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
 const raw = req.nextUrl.searchParams.get('q')?.trim()
  if (!raw) return NextResponse.json({ ok: false, error: 'Parámetro q requerido' }, { status: 400 })
  console.log('[SCAN] raw:', raw)

  // Intentar parsear como JSON (etiquetas ML Flex)
  let q = raw
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.id) q = String(parsed.id)
  } catch {}

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { id:          q },
        { qrCode:      q },
        { orderNumber: q },
        { orderNumber: `#${q}` },
        { sourceId:    q }, // buscar por ID de origen (WooCommerce, Shopify, Senby)
        { externalId:  q }, // buscar por ID de Envios Now también
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
