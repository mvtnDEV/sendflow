export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getPublicTracking }         from '@/lib/services/tracking.service'
import { checkRateLimit, clientIp }  from '@/lib/utils/rate-limit'

const MAX_POR_MINUTO = 30

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const search = searchParams.get('q')?.trim()
            || searchParams.get('id')?.trim()
            || searchParams.get('qr')?.trim()

  if (!search) {
    return NextResponse.json({ ok: false, error: 'Parámetro requerido: q, id o qr' }, { status: 400 })
  }

  // Endpoint público sin auth sobre miles de pedidos: hay que limitarlo o es enumerable
  const permitido = await checkRateLimit(`track:${clientIp(req.headers)}`, MAX_POR_MINUTO, 60)
  if (!permitido) {
    return NextResponse.json(
      { ok: false, error: 'Demasiadas consultas. Intenta de nuevo en un minuto.' },
      { status: 429 },
    )
  }

  const data = await getPublicTracking(search)

  // Mismo mensaje para "no existe" y "no autorizado"
  if (!data) {
    return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, data })
}
