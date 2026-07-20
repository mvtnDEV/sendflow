export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const orders = await prisma.order.findMany({
    where: {
      storeId:     'cmpanvuns000053f2gbs46t83',
      status:      'IN_TRANSIT',
      inTransitAt: { gte: new Date('2026-07-20T00:00:00-04:00') },
    },
    select: { id: true, orderNumber: true },
  })

  console.log(`[Reenvio Senby] Procesando ${orders.length} pedidos`)

  let enviados = 0
  let errores  = 0

  const { notifyWebhooks } = await import('@/lib/services/webhook.service')

  for (const order of orders) {
    try {
      await notifyWebhooks(order.id, 'IN_TRANSIT', 'RECEIVED')
      enviados++
      console.log(`[Reenvio Senby] ✅ ${order.orderNumber}`)
      // ── Delay para evitar deduplicación y no saturar el webhook de Senby ──
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      errores++
      console.error(`[Reenvio Senby] ❌ ${order.orderNumber}:`, err)
    }
  }

  return NextResponse.json({ ok: true, total: orders.length, enviados, errores })
}
