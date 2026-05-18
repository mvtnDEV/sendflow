export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyApiKey } from '@/lib/utils/api-auth'
import { createOrder } from '@/lib/services/order.service'

// ID fijo de la tienda Envíame en SendFlow
const ENVIAME_STORE_ID = 'cmovuegdk000051ctcljm2ort'

// POST /api/v1/orders — crear pedido
export async function POST(req: NextRequest) {
  const apiKey = await verifyApiKey(req)
  if (!apiKey) return NextResponse.json({ ok: false, error: 'API Key inválida o no enviada' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })

  const {
    customerName, customerPhone, customerEmail,
    addressStreet, addressComuna, addressRegion, addressNotes,
    bultos, externalId, storeId, subStoreName,
  } = body

  if (!customerName)  return NextResponse.json({ ok: false, error: 'customerName es requerido' }, { status: 400 })
  if (!addressStreet) return NextResponse.json({ ok: false, error: 'addressStreet es requerido' }, { status: 400 })
  if (!addressComuna) return NextResponse.json({ ok: false, error: 'addressComuna es requerido' }, { status: 400 })
  if (!addressRegion) return NextResponse.json({ ok: false, error: 'addressRegion es requerido' }, { status: 400 })

  // Todos los pedidos que vienen por API van a Envíame
  // a menos que se especifique un storeId distinto
  let resolvedStoreId = storeId || apiKey.storeId || ENVIAME_STORE_ID
  if (!resolvedStoreId) {
    const firstStore = await prisma.store.findFirst({ where: { isActive: true }, select: { id: true } })
    if (!firstStore) return NextResponse.json({ ok: false, error: 'No hay tiendas disponibles' }, { status: 400 })
    resolvedStoreId = firstStore.id
  }

  try {
    const order = await createOrder({
      storeId:       resolvedStoreId,
      platform:      'MANUAL',
      customerName,
      customerPhone,
      customerEmail,
      addressStreet,
      addressComuna,
      addressRegion,
      addressNotes,
      bultos:        bultos ?? 1,
      sourceId:      externalId,
      subStoreName:  subStoreName ?? undefined,
      createdBy:     'api',
    })

    return NextResponse.json({
      ok: true,
      data: {
        id:          order.id,
        orderNumber: order.orderNumber,
        qrCode:      order.qrCode,
        status:      order.status,
        labelUrl:    `${process.env.APP_URL}/api/labels/${order.id}`,
        createdAt:   order.createdAt,
      }
    }, { status: 201 })

  } catch (err: any) {
    console.error('[API v1] Error creando pedido:', err)
    return NextResponse.json({ ok: false, error: err.message ?? 'Error interno' }, { status: 500 })
  }
}

// GET /api/v1/orders — listar pedidos
export async function GET(req: NextRequest) {
  const apiKey = await verifyApiKey(req)
  if (!apiKey) return NextResponse.json({ ok: false, error: 'API Key inválida o no enviada' }, { status: 401 })

  const searchParams = req.nextUrl.searchParams
  const status       = searchParams.get('status')       ?? undefined
  const date         = searchParams.get('date')         ?? undefined
  const externalId   = searchParams.get('externalId')   ?? undefined
  const subStoreName = searchParams.get('subStoreName') ?? undefined
  const dateFrom     = searchParams.get('dateFrom')     ?? undefined
  const dateTo       = searchParams.get('dateTo')       ?? undefined
  const page         = Number(searchParams.get('page') ?? 1)
  const pageSize     = Math.min(Number(searchParams.get('pageSize') ?? 20), 100)
  const skip         = (page - 1) * pageSize

  const where: any = {}
  if (apiKey.storeId) where.storeId    = apiKey.storeId
  if (status)         where.status      = status
  if (externalId)     where.sourceId    = externalId
  if (subStoreName)   where.subStoreName = subStoreName
  if (date) {
    const d = new Date(date)
    where.createdAt = {
      gte: new Date(d.setHours(0, 0, 0, 0)),
      lte: new Date(d.setHours(23, 59, 59, 999)),
    }
  } else if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo + 'T23:59:59') }),
    }
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where, skip, take: pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, orderNumber: true,
        externalId: true, sourceId: true, subStoreName: true,
        status: true, customerName: true, customerPhone: true,
        addressStreet: true, addressComuna: true, addressRegion: true,
        bultos: true, createdAt: true, receivedAt: true,
        inTransitAt: true, deliveredAt: true,
        store: { select: { name: true } },
      },
    }),
    prisma.order.count({ where }),
  ])

  return NextResponse.json({
    ok: true,
    data: {
      items: items.map(o => ({
        ...o,
        storeName:    o.store.name,
        subStoreName: o.subStoreName,
        externalId:   o.sourceId,
      })),
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  })
}
