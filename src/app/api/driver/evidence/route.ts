export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

function verifyToken(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const p = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString())
    if (p.exp < Date.now() || p.role !== 'DRIVER') return null
    return p as { id: string; name: string }
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const driver = verifyToken(req)
  if (!driver) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.orderId || !body?.photo1) {
    return NextResponse.json({ ok: false, error: 'orderId y photo1 requeridos' }, { status: 400 })
  }

  const now = new Date()

  const updated = await prisma.order.update({
    where: { id: body.orderId },
    data: {
      evidencePhoto1:  body.photo1,
      evidencePhoto2:  body.photo2 || null,
      evidenceNote:    body.note   || null,
      evidenceTakenAt: now,
      evidenceTakenBy: driver.id,
      status:          'DELIVERED',
      deliveredAt:     now,
      events: {
        create: {
          status:    'DELIVERED',
          note:      body.note || 'Entregado con evidencia fotográfica',
          createdBy: driver.id,
        },
      },
    },
  })

  return NextResponse.json({ ok: true, data: updated })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  })
}
