export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { listOrders, createOrder } from '@/lib/services/order.service'
import type { OrderFilters } from '@/types'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok:false, error:'No autorizado' }, { status:401 })

  const { searchParams } = req.nextUrl
  const filters: OrderFilters = {
    storeId:  user.role === 'STORE_ADMIN' ? (user.storeId ?? undefined) : (searchParams.get('storeId') ?? undefined),
    status:   searchParams.get('status')   ?? undefined,
    platform: searchParams.get('platform') ?? undefined,
    search:   searchParams.get('search')   ?? undefined,
    comuna:   searchParams.get('comuna')   ?? undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo:   searchParams.get('dateTo')   ?? undefined,
    page:     Number(searchParams.get('page') ?? 1),
    pageSize: Number(searchParams.get('pageSize') ?? 10),
  }

  try {
    const result = await listOrders(filters)
    return NextResponse.json({ ok:true, data:result })
  } catch (err) {
    console.error('[GET /api/orders]', err)
    return NextResponse.json({ ok:false, error:'Error interno' }, { status:500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok:false, error:'No autorizado' }, { status:401 })

  // VIEWER no puede crear pedidos
  if (user.role === 'VIEWER')
    return NextResponse.json({ ok:false, error:'Sin permisos — modo solo lectura' }, { status:403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok:false, error:'Body inválido' }, { status:400 })

  const storeId = body.storeId ?? user.storeId
  if (!storeId) return NextResponse.json({ ok:false, error:'storeId requerido' }, { status:400 })
  if (!canAccessStore(user, storeId))
    return NextResponse.json({ ok:false, error:'Sin acceso a esta tienda' }, { status:403 })

  const required = ['customerName','addressStreet','addressComuna','addressRegion']
  for (const field of required) {
    if (!body[field]) return NextResponse.json({ ok:false, error:`Campo requerido: ${field}` }, { status:400 })
  }

  try {
    const order = await createOrder({
      storeId,
      platform:      'MANUAL',
      customerName:  body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      addressStreet: body.addressStreet,
      addressComuna: body.addressComuna,
      addressRegion: body.addressRegion,
      addressNotes:  body.addressNotes,
      bultos:        body.bultos ?? 1,
      weightKg:      body.weightKg,
      createdBy:     user.id,
    })
    return NextResponse.json({ ok:true, data:order }, { status:201 })
  } catch (err) {
    console.error('[POST /api/orders]', err)
    return NextResponse.json({ ok:false, error:'Error creando pedido' }, { status:500 })
  }
}
