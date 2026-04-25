export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { uploadEvidenceToStorage, saveOrderEvidence } from '@/lib/services/evidence.service'
import { prisma } from '@/lib/db/prisma'

// POST /api/orders/[id]/evidence
// Acepta multipart/form-data con:
//   photo1: File (requerido)
//   photo2: File (opcional)
//   note:   string (opcional)
//   markDelivered: "true" | "false"
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  if (user.role === 'VIEWER') return NextResponse.json({ ok:false, error:'Sin permisos — modo solo lectura' }, { status:403 })

  // Verificar acceso al pedido
  const order = await prisma.order.findUnique({
    where:  { id: params.id },
    select: { storeId: true, status: true },
  })
  if (!order) return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  if (!canAccessStore(user, order.storeId)) {
    return NextResponse.json({ ok: false, error: 'Sin acceso' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const photo1   = formData.get('photo1') as File | null
    const photo2   = formData.get('photo2') as File | null
    const note     = formData.get('note') as string | null
    const markDel  = formData.get('markDelivered') === 'true'

    if (!photo1) {
      return NextResponse.json({ ok: false, error: 'Foto 1 requerida' }, { status: 400 })
    }

    // Validar tamaño (máx 5MB por foto)
    if (photo1.size > 5 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'Foto 1 supera 5MB' }, { status: 400 })
    }
    if (photo2 && photo2.size > 5 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'Foto 2 supera 5MB' }, { status: 400 })
    }

    // Subir a Supabase Storage
    const buf1  = Buffer.from(await photo1.arrayBuffer())
    const url1  = await uploadEvidenceToStorage(buf1, photo1.type, params.id, 1)

    let url2: string | undefined
    if (photo2 && photo2.size > 0) {
      const buf2 = Buffer.from(await photo2.arrayBuffer())
      url2       = await uploadEvidenceToStorage(buf2, photo2.type, params.id, 2)
    }

    const updated = await saveOrderEvidence({
      orderId:       params.id,
      photo1Url:     url1,
      photo2Url:     url2,
      note:          note || undefined,
      takenBy:       user.id,
      markDelivered: markDel,
    })

    return NextResponse.json({ ok: true, data: updated })
  } catch (err) {
    console.error('[POST /api/orders/evidence]', err)
    return NextResponse.json({ ok: false, error: 'Error subiendo evidencia' }, { status: 500 })
  }
}
