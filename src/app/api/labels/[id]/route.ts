import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { generateLabelForOrder } from '@/lib/services/label.service'
import { prisma } from '@/lib/db/prisma'

// GET /api/labels/[id]
// Devuelve el HTML de la etiqueta para imprimir en el browser
// ?format=html (default) → HTML imprimible
// ?format=json           → solo los datos del label
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })

  // Verificar acceso al pedido
  const order = await prisma.order.findUnique({
    where:  { id: params.id },
    select: { storeId: true },
  })

  if (!order) return new NextResponse('Pedido no encontrado', { status: 404 })
  if (!canAccessStore(user, order.storeId)) {
    return new NextResponse('Sin acceso', { status: 403 })
  }

  const format = req.nextUrl.searchParams.get('format') ?? 'html'

  try {
    const { html, order: labelData } = await generateLabelForOrder(params.id)

    if (format === 'json') {
      return NextResponse.json({ ok: true, data: labelData })
    }

    // Devuelve HTML con script de auto-print al cargar
    const printableHtml = html.replace(
      '</body>',
      `<script>window.onload = () => { window.print(); }</script></body>`,
    )

    return new NextResponse(printableHtml, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('[GET /api/labels]', err)
    return new NextResponse('Error generando etiqueta', { status: 500 })
  }
}
