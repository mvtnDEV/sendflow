export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionUser } from '@/lib/utils/auth'

const API_BASE = 'https://api.enviosnow.cl/api/v1'
const API_KEY  = () => process.env.ENVIOSNOW_API_KEY ?? ''

const STATE_MAP: Record<string, string> = {
  'entregado':    'DELIVERED',
  'cancelado':    'CANCELLED',
  'por entregar': 'IN_TRANSIT',
  'pendiente':    'INCIDENT',
  'no entregado': 'INCIDENT',
  'fallido':      'INCIDENT',
}

export async function POST(req: NextRequest) {
  const secret     = req.headers.get('x-sync-secret')
  const isCron     = req.headers.get('x-vercel-cron') === '1'
  const isValidSecret = secret === 'moovex-sync-2026'

  if (!isCron && !isValidSecret) {
    const user = await getSessionUser()
    if (!user || user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
  }
  // Obtener todos los pedidos IN_TRANSIT con externalId
  const orders = await prisma.order.findMany({
    where: {
      status:     'IN_TRANSIT',
      externalId: { not: null },
    },
    select: {
      id:          true,
      orderNumber: true,
      externalId:  true,
      customerName:true,
    },
  })

  console.log(`[Sync Now] ${orders.length} pedidos IN_TRANSIT a verificar`)

  const results = {
    total:     orders.length,
    updated:   0,
    noChanges: 0,
    errors:    0,
    details:   [] as any[],
  }

  for (const order of orders) {
    try {
      // Consultar estado en Now por externalId (orderNumber sin #)
      const externalId = order.orderNumber.replace('#', '')
      const res = await fetch(`${API_BASE}/delivery/externalId/${encodeURIComponent(externalId)}`, {
        headers: { 'X-API-Key': API_KEY() },
      })

      if (!res.ok) {
        // Intentar por ID interno de Now
        const res2 = await fetch(`${API_BASE}/delivery/${order.externalId}`, {
          headers: { 'X-API-Key': API_KEY() },
        })
        if (!res2.ok) {
          results.errors++
          results.details.push({ orderNumber: order.orderNumber, error: 'No encontrado en Now' })
          continue
        }
        const data2 = await res2.json()
        await processDelivery(order, data2, results)
        continue
      }

      const data = await res.json()
      await processDelivery(order, data, results)

    } catch (err: any) {
      results.errors++
      results.details.push({ orderNumber: order.orderNumber, error: err.message })
    }
  }

  console.log('[Sync Now] Resultados:', JSON.stringify(results))
  return NextResponse.json({ ok: true, results })
}

async function processDelivery(order: any, data: any, results: any) {
  const nowStatus = data.status ?? data.state ?? null
  if (!nowStatus) {
    results.noChanges++
    return
  }

  const newStatus = STATE_MAP[String(nowStatus).toLowerCase()]
  if (!newStatus || newStatus === 'IN_TRANSIT') {
    results.noChanges++
    results.details.push({ orderNumber: order.orderNumber, nowStatus, action: 'sin_cambio' })
    return
  }

  const now    = new Date()
  const images = data.images ?? []
  const note   = data.deliveryComment || 'Sincronizado desde Envios Now'
  const receiverName = data.receiverName || null
  const receiverRut  = data.receiverRut && data.receiverRut !== 'No da rut' ? data.receiverRut : null

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: newStatus as any,
      ...(newStatus === 'DELIVERED' && { deliveredAt: now }),
      ...(newStatus === 'INCIDENT'  && {}),
      ...(images?.[0] && { evidencePhoto1: images[0] }),
      ...(images?.[1] && { evidencePhoto2: images[1] }),
      evidenceNote: [
        note,
        receiverName ? `Recibió: ${receiverName}` : null,
        receiverRut  ? `RUT: ${receiverRut}`       : null,
      ].filter(Boolean).join(' · ') || undefined,
      events: {
        create: {
          status:    newStatus as any,
          note:      `Sync Now · ${note}${receiverName ? ` · Recibió: ${receiverName}` : ''}`,
          createdBy: 'enviosnow-sync',
        },
      },
    },
  })

  results.updated++
  results.details.push({ orderNumber: order.orderNumber, nowStatus, newStatus, action: 'actualizado' })
  console.log(`[Sync Now] ${order.orderNumber} → ${newStatus}`)
}
