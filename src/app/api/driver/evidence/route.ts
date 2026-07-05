export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db/prisma'
import { createClient }              from '@supabase/supabase-js'

function verifyToken(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const p = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString())
    if (p.exp < Date.now() || p.role !== 'DRIVER') return null
    return p as { id: string; name: string }
  } catch { return null }
}

async function uploadPhoto(base64: string, orderId: string, index: number): Promise<string | null> {
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
    const fileName = `evidence/${orderId}/${Date.now()}_${index}.${ext}`
    const { error } = await supabase.storage
      .from('evidence')
      .upload(fileName, buffer, { contentType: `image/${ext}`, upsert: true })
    if (error) { console.error('[Storage] Error:', error); return null }
    const { data } = supabase.storage.from('evidence').getPublicUrl(fileName)
    return data.publicUrl
  } catch (err) {
    console.error('[Storage] Error inesperado:', err)
    return null
  }
}

export async function POST(req: NextRequest) {
  const driver = verifyToken(req)
  if (!driver) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.orderId || !body?.photo1) {
    return NextResponse.json({ ok: false, error: 'orderId y photo1 requeridos' }, { status: 400 })
  }

  const previous = await prisma.order.findUnique({
    where:  { id: body.orderId },
    select: { status: true },
  })
  const previousStatus = previous?.status ?? 'IN_TRANSIT'

  // ── Subir fotos a Storage antes de guardar ──
  const [photo1Url, photo2Url] = await Promise.all([
    uploadPhoto(body.photo1, body.orderId, 1),
    body.photo2 ? uploadPhoto(body.photo2, body.orderId, 2) : Promise.resolve(null),
  ])

  const now = new Date()
  await prisma.order.update({
    where: { id: body.orderId },
    data: {
      evidencePhoto1:  photo1Url ?? body.photo1,
      evidencePhoto2:  photo2Url ?? body.photo2 ?? null,
      evidenceNote:    body.note || null,
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

  // ── Notificar webhook — la deduplicación en webhook.service.ts evita duplicados ──
  try {
    const { notifyWebhooks } = await import('@/lib/services/webhook.service')
    await notifyWebhooks(body.orderId, 'DELIVERED', String(previousStatus))
  } catch (err) {
    console.error('[Evidence] Error notificando webhook:', err)
  }

  return NextResponse.json({ ok: true })
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
