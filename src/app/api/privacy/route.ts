export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { requestDataDeletion, anonymizeOrder, PRIVACY_POLICY } from '@/lib/services/privacy.service'
import { prisma } from '@/lib/db/prisma'

// GET /api/privacy — devuelve la política de privacidad
export async function GET() {
  return NextResponse.json({ ok: true, data: PRIVACY_POLICY })
}

// POST /api/privacy/deletion — solicitud de eliminación de datos
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.requesterEmail || !body?.requesterName) {
    return NextResponse.json({ ok: false, error: 'Nombre y email requeridos' }, { status: 400 })
  }

  const request = await requestDataDeletion({
    requesterName:  body.requesterName,
    requesterEmail: body.requesterEmail,
    orderId:        body.orderId,
    reason:         body.reason,
  })

  return NextResponse.json({ ok: true, data: { id: request.id } }, { status: 201 })
}
