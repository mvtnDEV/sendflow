export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import { toEnviosNowPayload, createEnviosNowDelivery } from '@/lib/services/enviosnow.service'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const order = await prisma.order.findUnique({
    where:   { id: params.id },
    include: { store: true },
  })

  if (!order) {
    return NextResponse.json({ ok: false, error: 'Pedido no encontrado' }, { status: 404 })
  }

  try {
    const payload = toEnviosNowPayload(order)
    const result  = await createEnviosNowDelivery(payload)

   if (!result.ok) {
      console.error('[send-enviosnow] Error Now:', result.error, '| payload:', JSON.stringify(payload))
      return NextResponse.json({ ok: false, error: result.error })
    }

    if (result.id && result.id !== 'duplicate') {
      await prisma.order.update({
        where: { id: order.id },
        data:  { externalId: String(result.id) },
      })
    }

    return NextResponse.json({ ok: true, id: result.id })
  } catch (err: any) {
    console.error('[send-enviosnow]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
