export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { generateBulkLabels, markLabelsAsPrinted } from '@/lib/services/label.service'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })

  const { orderIds } = await req.json().catch(() => ({}))
  if (!orderIds?.length) return new NextResponse('orderIds requerido', { status: 400 })

  try {
    const html = await generateBulkLabels(orderIds)

    // ── Marcar pedidos como etiqueta impresa ──
    await markLabelsAsPrinted(orderIds)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('[POST /api/labels/bulk]', err)
    return new NextResponse('Error generando etiquetas', { status: 500 })
  }
}
