export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { desde } = await req.json().catch(() => ({ desde: 0 }))

  // ── Traer pedidos IN_TRANSIT de Senby de hoy sin webhook exitoso ──
  const orders = await prisma.order.findMany({
    where: {
      storeId:     'cmpanvuns000053f2gbs46t83',
      status:      'IN_TRANSIT',
      inTransitAt: { gte: new Date('2026-07-20T00:00:00-04:00') },
      webhookEvents: {
        none: {
          success:   true,
          createdAt: { gte: new Date('2026-07-20T00:00:00-04:00') },
        },
      },
    },
    select:  { id: true, orderNumber: true },
    skip:    desde,
    take:    50,
    orderBy: { inTransitAt: 'asc' },
  })

  console.log(`[Reenvio Senby] Lote desde ${desde}, procesando ${orders.length} pedidos`)

  let enviados = 0
  let errores  = 0

  const { notifyWebhooks } = await import('@/lib/services/webhook.service')

  for (const order of orders) {
    try {
      await notifyWebhooks(order.id, 'IN_TRANSIT', 'RECEIVED')
      enviados++
      console.log(`[Reenvio Senby] ✅ ${order.orderNumber}`)
      await new Promise(r => setTimeout(r, 300))
    } catch (err) {
      errores++
      console.error(`[Reenvio Senby] ❌ ${order.orderNumber}:`, err)
    }
  }

  return NextResponse.json({ 
    ok:        true, 
    total:     orders.length, 
    enviados, 
    errores,
    siguiente: orders.length === 50 ? desde + 50 : null
  })
}
