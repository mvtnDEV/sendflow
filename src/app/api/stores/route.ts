export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import { encrypt } from '@/lib/utils/crypto'
import type { Platform } from '@prisma/client'

// GET /api/stores — lista tiendas e integraciones
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const where = user.role === 'SUPER_ADMIN'
    ? {}
    : { id: user.storeId ?? '' }

  const stores = await prisma.store.findMany({
    where,
    include: {
      integrations: {
        select: {
          id:        true,
          platform:  true,
          isActive:  true,
          lastSyncAt: true,
        },
      },
      _count: { select: { orders: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ ok: true, data: stores })
}

// POST /api/stores — solo SUPER_ADMIN puede crear tiendas
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.slug) {
    return NextResponse.json({ ok: false, error: 'name y slug requeridos' }, { status: 400 })
  }

  const store = await prisma.store.create({
    data: {
      name:  body.name,
      slug:  body.slug,
      email: body.email,
      phone: body.phone,
    },
  })

  return NextResponse.json({ ok: true, data: store }, { status: 201 })
}
