export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

function verifyDriverToken(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString())
    if (payload.exp < Date.now()) return null
    if (payload.role !== 'DRIVER') return null
    return payload as { id: string; name: string; storeId: string | null }
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const driver = verifyDriverToken(req)
  if (!driver) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const { orderIds } = await req.json().catch(() => ({}))
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'orderIds requerido' }, { status: 400 })
  }

  const now = new Date()
  let updated = 0

  for (const orderId of orderIds) {
    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } })

      // ── Permitir PENDING, INCIDENT y DELIVERED ──
      // Los Flex pueden llegar a DELIVERED antes de que el conductor
      // los recepcione en bodega — el escaneo ocurre temprano
      if (!order || !['PENDING', 'INCIDENT', 'DELIVERED'].includes(order.status)) continue

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status:     'RECEIVED',
          receivedAt: now,
          events: {
            create: {
              status:    'RECEIVED',
              note:      'Recepcionado en bodega vía escaneo batch',
              createdBy: driver.id,
            },
          },
        },
      })

      try {
        const { toEnviosNowPayload, createEnviosNowDelivery } = await import('@/lib/services/enviosnow.service')
        const fullOrder = await prisma.order.findUnique({
          where:   { id: orderId },
          include: { store: true },
        })
        if (fullOrder) {
          const payload = toEnviosNowPayload(fullOrder)
          const result  = await createEnviosNowDelivery(payload)
          if (result.ok && result.id && result.id !== 'duplicate') {
            await prisma.order.update({
              where: { id: orderId },
              data: {
                externalId: String(result.id),
                ...(!fullOrder.inTransitAt && { inTransitAt: now }),
              },
            })
          }
        }
      } catch (err) {
        console.error('[EnviosNow] Error en batch-receive:', err)
      }

      updated++
    } catch (err) {
      console.error('[batch-receive] Error en pedido:', orderId, err)
    }
  }

  return NextResponse.json({ ok: true, updated })
}
