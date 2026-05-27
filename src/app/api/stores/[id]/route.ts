export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()

  const store = await prisma.store.update({
    where: { id: params.id },
    data: {
      name:              body.name,
      email:             body.email             ?? null,
      phone:             body.phone             ?? null,
      rut:               body.rut               ?? null,
      encargado:         body.encargado         ?? null,
      addressRetiro:     body.addressRetiro     ?? null,
      tarifaUrbana:      body.tarifaUrbana      ?? null,
      tarifaExtraUrbana: body.tarifaExtraUrbana ?? null,
      tarifaRural:       body.tarifaRural       ?? null,
      tarifaRetiro:      body.tarifaRetiro      ?? null,
      fechaTarifa:       body.fechaTarifa       ?? null,
    },
  })

  return NextResponse.json({ ok: true, data: store })
}
