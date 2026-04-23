export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { createOrder } from '@/lib/services/order.service'
import { audit } from '@/lib/services/audit.service'
import type { Platform } from '@prisma/client'

// POST /api/orders/bulk
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const { storeId, storeName, platform, rows } = await req.json().catch(() => ({}))

  if (!storeId || !rows?.length) {
    return NextResponse.json({ ok: false, error: 'storeId y rows requeridos' }, { status: 400 })
  }
  if (!canAccessStore(user, storeId)) {
    return NextResponse.json({ ok: false, error: 'Sin acceso a esta tienda' }, { status: 403 })
  }

  let created = 0
  const errors: string[] = []

  for (const row of rows) {
    if (!row.customerName || !row.addressStreet || !row.addressComuna) {
      errors.push(`Fila sin datos requeridos: ${row.customerName || '(sin nombre)'}`)
      continue
    }
    try {
      await createOrder({
        storeId,
        integrationId: undefined,
        platform:      (platform || 'MANUAL') as Platform,
        customerName:  row.customerName,
        customerPhone: row.customerPhone || '',
        customerEmail: row.customerEmail || '',
        addressStreet: row.addressStreet,
        addressComuna: row.addressComuna,
        addressRegion: row.addressRegion || 'Metropolitana',
        addressNotes:  row.addressNotes  || '',
        bultos:        Number(row.bultos) || 1,
        weightKg:      Number(row.weightKg) || undefined,
        createdBy:     user.id,
      })
      created++
    } catch (e: any) {
      errors.push(e.message)
    }
  }

  await audit({
    userId:   user.id,
    action:   'CREATE_ORDER',
    resource: `store:${storeId}`,
    metadata: { type: 'bulk', created, errors: errors.length } as any,
  })

  return NextResponse.json({ ok: true, data: { created, errors } })
}
