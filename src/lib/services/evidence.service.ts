import { prisma } from '@/lib/db/prisma'
import { audit } from './audit.service'
import { setRetentionDate } from './privacy.service'

// ─── Subir evidencia a Supabase Storage ──────────────────────────────────────
// Las fotos se guardan en storage, solo la URL va a la DB
// Así la DB no se infla con base64 y las fotos se pueden gestionar independientemente

export async function uploadEvidenceToStorage(
  file:    Buffer,
  mimeType: string,
  orderId: string,
  slot:    1 | 2,
): Promise<string> {
  // Importar cliente de Supabase solo cuando se necesite
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const ext      = mimeType.includes('png') ? 'png' : 'jpg'
  const filePath = `evidence/${orderId}/foto${slot}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('evidence')
    .upload(filePath, file, {
      contentType:  mimeType,
      cacheControl: '3600',
      upsert:       false,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  // URL pública firmada (válida 10 años — ajustar si se quiere más control)
  const { data } = supabase.storage
    .from('evidence')
    .getPublicUrl(filePath)

  return data.publicUrl
}

// ─── Guardar evidencia en la DB ───────────────────────────────────────────────

export async function saveOrderEvidence(params: {
  orderId:      string
  photo1Url:    string
  photo2Url?:   string
  note?:        string
  takenBy:      string   // userId del conductor
  markDelivered?: boolean
}) {
  const now = new Date()

  const updated = await prisma.order.update({
    where: { id: params.orderId },
    data: {
      evidencePhoto1:  params.photo1Url,
      evidencePhoto2:  params.photo2Url ?? null,
      evidenceNote:    params.note ?? null,
      evidenceTakenAt: now,
      evidenceTakenBy: params.takenBy,
      ...(params.markDelivered && {
        status:      'DELIVERED',
        deliveredAt: now,
      }),
      events: params.markDelivered ? {
        create: {
          status:    'DELIVERED',
          note:      params.note || 'Entregado con evidencia fotográfica',
          createdBy: params.takenBy,
        },
      } : undefined,
    },
  })

  // Ley 21.719: fijar fecha de retención al entregar
  if (params.markDelivered) {
    await setRetentionDate(params.orderId)
  }

  await audit({
    userId:   params.takenBy,
    action:   'UPLOAD_EVIDENCE',
    resource: `order:${params.orderId}`,
    metadata: { hasPhoto2: !!params.photo2Url } as any,
  })

  return updated
}

// ─── Eliminar evidencia de storage (derecho de supresión) ────────────────────

export async function deleteEvidenceFromStorage(orderId: string) {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Listar y borrar todos los archivos de este pedido
  const { data: files } = await supabase.storage
    .from('evidence')
    .list(`evidence/${orderId}`)

  if (files && files.length > 0) {
    const paths = files.map(f => `evidence/${orderId}/${f.name}`)
    await supabase.storage.from('evidence').remove(paths)
  }
}
