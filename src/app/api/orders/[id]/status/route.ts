export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse }      from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { updateOrderStatus }              from '@/lib/services/order.service'
import { prisma }                         from '@/lib/db/prisma'
import { createClient }                   from '@supabase/supabase-js'
import type { OrderStatus }               from '@prisma/client'

const VALID: OrderStatus[] = ['PENDING','RECEIVED','IN_TRANSIT','DELIVERED','INCIDENT','CANCELLED']

async function uploadEvidencePhoto(base64: string, orderId: string): Promise<string | null> {
  try {
    if (!base64.startsWith('data:image')) return base64
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const matches = base64.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) return null
    const ext      = matches[1]
    const buffer   = Buffer.from(matches[2], 'base64')
    const fileName = `evidence/${orderId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('evidence')
      .upload(fileName, buffer, { contentType: `image/${ext}`, upsert: true })
    if (error) { console.error('[Storage] Error subiendo foto:', error); return null }
    const { data } = supabase.storage.from('evidence').getPublicUrl(fileName)
    return data.publicUrl
  } catch (err) {
    console.error('[Storage] Error inesperado:', err)
    return null
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok:false, error:'No autorizado' }, { status:401 })
  if ((user.role as string) === 'VIEWER') return NextResponse.json({ ok:false, error:'Sin permisos — modo solo lectura' }, { status:403 })

  const body = await req.json().catch(() => null)
  const status: OrderStatus = body?.status
  if (!status || !VALID.includes(status))
    return NextResponse.json({ ok:false, error:'Estado inválido' }, { status:400 })

  const order = await prisma.order.findUnique({
    where:  { id: params.id },
    select: { storeId: true },
  })
  if (!order) return NextResponse.json({ ok:false, error:'No encontrado' }, { status:404 })
  if (!canAccessStore(user, order.storeId))
    return NextResponse.json({ ok:false, error:'Sin acceso' }, { status:403 })

  // ── DELIVERED: guardar evidencia ANTES del webhook ──
  if (status === 'DELIVERED' && (body?.evidencePhoto1 || body?.receptorName || body?.receptorRut)) {
    let photoUrl: string | null = null
    if (body.evidencePhoto1) {
      photoUrl = await uploadEvidencePhoto(body.evidencePhoto1, params.id)
    }
    await prisma.order.update({
      where: { id: params.id },
      data: {
        ...(photoUrl          && { evidencePhoto1: photoUrl }),
        ...(body.evidenceNote && { evidenceNote:   body.evidenceNote }),
        ...(body.receptorName && { receptorName:   body.receptorName }),
        ...(body.receptorRut  && { receptorRut:    body.receptorRut }),
        evidenceTakenAt: new Date(),
        evidenceTakenBy: user.id,
      } as any,
    })
  }

  // ── INCIDENT: guardar motivo ANTES del webhook ──
  if (status === 'INCIDENT' && body?.incidentReason) {
    await prisma.order.update({
      where: { id: params.id },
      data:  { incidentReason: body.incidentReason } as any,
    })
  }

  // ── skipEnviosNow: true → no crear envío en EnviosNow desde el sistema web ──
  const updated = await updateOrderStatus(params.id, status, body?.note, user.id, true)

  return NextResponse.json({ ok:true, data: updated })
}
