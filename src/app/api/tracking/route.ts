export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

const TZ = 'America/Santiago'

function fmt(d: Date | null): string | null {
  if (!d) return null
  return new Date(d).toLocaleString('es-CL', {
    timeZone: TZ, day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Ofusca el nombre — muestra "María G." en lugar de "María González"
function maskName(name: string): string {
  if (!name) return '—'
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].slice(0, 3) + '***'
  return `${parts[0]} ${parts[1].charAt(0)}.`
}

// Ofusca la dirección — muestra calle y comuna pero no número depto
function maskAddress(street: string, comuna: string): string {
  // Quitar número de departamento/oficina para no exponer datos exactos
  const clean = street.replace(/\b(depto?|dpto?|oficina|of\.|apto?|apt)\b.*$/i, '').trim()
  return `${clean}, ${comuna}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q      = searchParams.get('q')?.trim()
  const id     = searchParams.get('id')?.trim()
  const qr     = searchParams.get('qr')?.trim()
  const search = q || id || qr

  if (!search) {
    return NextResponse.json({ ok: false, error: 'Parámetro requerido: q, id o qr' }, { status: 400 })
  }

  // Sanitizar — solo alfanuméricos, #, guiones
  const sanitized = search.replace(/[^a-zA-Z0-9#\-_]/g, '').slice(0, 100)
  if (!sanitized) {
    return NextResponse.json({ ok: false, error: 'Parámetro inválido' }, { status: 400 })
  }

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: sanitized },
        { orderNumber: `#${sanitized}` },
        { qrCode:      sanitized },
      ],
    },
    select: {
      orderNumber:    true,
      status:         true,
      bultos:         true,
      customerName:   true,   // se ofusca antes de enviar
      addressStreet:  true,   // se ofusca antes de enviar
      addressComuna:  true,
      createdAt:      true,
      receivedAt:     true,
      inTransitAt:    true,
      deliveredAt:    true,
      evidencePhoto1: true,   // ✅ prueba de entrega para el cliente
      evidencePhoto2: true,
      evidenceNote:   true,
      // ❌ NO incluir: customerPhone, customerEmail, receptorRut
      store:  { select: { name: true } },
      events: {
        orderBy: { createdAt: 'asc' },
        select:  {
          status:    true,
          note:      true,
          createdAt: true,
        },
      },
    },
  })

  if (!order) {
    return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  }

  // Filtrar notas internas del historial
  const NOTAS_INTERNAS = ['envios now', 'enviame', 'enviosnow', 'now:', 'id now', 'delivery id']
  const timelinePublico = order.events
    .filter(e => !e.note || !NOTAS_INTERNAS.some(n => e.note!.toLowerCase().includes(n)))
    .map(e => ({
      status:    e.status,
      note:      e.note,
      formatted: fmt(e.createdAt),
    }))

  return NextResponse.json({
    ok:   true,
    data: {
      orderNumber:    order.orderNumber,
      storeName:      order.store.name,
      status:         order.status,
      bultos:         order.bultos,
      // Datos del cliente ofuscados — suficiente para confirmar que es su pedido
      customerName:   maskName(order.customerName),
      address:        maskAddress(order.addressStreet, order.addressComuna),
      // Timestamps
      createdAt:      fmt(order.createdAt),
      receivedAt:     fmt(order.receivedAt),
      inTransitAt:    fmt(order.inTransitAt),
      deliveredAt:    fmt(order.deliveredAt),
      // Evidencia — el cliente tiene derecho a ver la prueba de entrega
      evidencePhoto1: order.evidencePhoto1 || null,
      evidencePhoto2: order.evidencePhoto2 || null,
      evidenceNote:   order.evidenceNote   || null,
      // Historial sin notas internas
      timeline:       timelinePublico,
    },
  })
}
