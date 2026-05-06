export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import crypto from 'crypto'

function generateApiKey(): string {
  return `sk_live_${crypto.randomBytes(20).toString('hex')}`
}

// GET /api/api-keys — listar API Keys
export async function GET() {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const keys = await prisma.apiKey.findMany({
    where:   { isActive: true },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, name: true, key: true, isActive: true, lastUsedAt: true, createdAt: true },
  })

  return NextResponse.json({ ok: true, data: keys })
}

// POST /api/api-keys — crear API Key
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const { name } = await req.json().catch(() => ({}))
  if (!name?.trim()) {
    return NextResponse.json({ ok: false, error: 'Nombre requerido' }, { status: 400 })
  }

  const key    = generateApiKey()
  const apiKey = await prisma.apiKey.create({
    data: { name: name.trim(), key },
  })

  return NextResponse.json({ ok: true, data: { id: apiKey.id, name: apiKey.name, key: apiKey.key } }, { status: 201 })
}
