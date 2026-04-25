export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse }      from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { updateOrderStatus }              from '@/lib/services/order.service'
import { prisma }                         from '@/lib/db/prisma'
import type { OrderStatus }               from '@prisma/client'

const VALID: OrderStatus[] = ['PENDING','RECEIVED','IN_TRANSIT','DELIVERED','INCIDENT','CANCELLED']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok:false, error:'No autorizado' }, { status:401 })
  if (user.role === 'VIEWER') return NextResponse.json({ ok:false, error:'Sin permisos — modo solo lectura' }, { status:403 })

  const body   = await req.json().catch(() => null)
  const status: OrderStatus = body?.status

  if (!status || !VALID.includes(status))
    return NextResponse.json({ ok:false, error:'Estado inválido' }, { status:400 })

  const order = await prisma.order.findUnique({
    where:  { id: params.id },
    select: { storeId:true },
  })
  if (!order) return NextResponse.json({ ok:false, error:'No encontrado' }, { status:404 })
  if (!canAccessStore(user, order.storeId))
    return NextResponse.json({ ok:false, error:'Sin acceso' }, { status:403 })

  const updated = await updateOrderStatus(params.id, status, body?.note, user.id)

  // Si es entrega manual con datos adicionales
  if (status === 'DELIVERED' && (body?.evidencePhoto1 || body?.receptorName || body?.receptorRut)) {
    await prisma.order.update({
      where: { id: params.id },
      data: {
        ...(body.evidencePhoto1 && { evidencePhoto1: body.evidencePhoto1 }),
        ...(body.receptorName   && { evidenceNote: `Recibió: ${body.receptorName}${body.receptorRut ? ` · RUT: ${body.receptorRut}` : ''}${body.note ? ` · ${body.note}` : ''}` }),
        evidenceTakenAt: new Date(),
        evidenceTakenBy: user.id,
      },
    })
  }

  return NextResponse.json({ ok:true, data: updated })
}
