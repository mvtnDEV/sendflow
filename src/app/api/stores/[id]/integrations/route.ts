export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import { encrypt } from '@/lib/utils/crypto'
import type { Platform } from '@prisma/client'

// POST /api/stores/[id]/integrations — conectar una plataforma a la tienda
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  if (user.role === 'VIEWER') return NextResponse.json({ ok:false, error:'Sin permisos — modo solo lectura' }, { status:403 })
  if (!canAccessStore(user, params.id)) {
    return NextResponse.json({ ok: false, error: 'Sin acceso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { platform, credentials, externalStoreId, webhookSecret } = body ?? {}

  if (!platform || !credentials) {
    return NextResponse.json({ ok: false, error: 'platform y credentials requeridos' }, { status: 400 })
  }

  // credentials es un objeto { key, secret, ... } según la plataforma
  // Se serializa como "key|secret|..." y se cifra
  const apiKeyEnc = encrypt(Object.values(credentials).join('|'))

  const integration = await prisma.storeIntegration.upsert({
    where:  { storeId_platform: { storeId: params.id, platform: platform as Platform } },
    create: {
      storeId:         params.id,
      platform:        platform as Platform,
      apiKeyEnc,
      externalStoreId,
      webhookSecret,
      isActive:        true,
    },
    update: {
      apiKeyEnc,
      externalStoreId,
      webhookSecret,
      isActive: true,
    },
  })

  return NextResponse.json({ ok: true, data: { id: integration.id, platform } }, { status: 201 })
}

// DELETE /api/stores/[id]/integrations/[platform] — desconectar plataforma
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  if (!canAccessStore(user, params.id)) {
    return NextResponse.json({ ok: false, error: 'Sin acceso' }, { status: 403 })
  }

  const { platform } = await req.json().catch(() => ({}))

  await prisma.storeIntegration.updateMany({
    where:  { storeId: params.id, platform: platform as Platform },
    data:   { isActive: false },
  })

  return NextResponse.json({ ok: true })
}
