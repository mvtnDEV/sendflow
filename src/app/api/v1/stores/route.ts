export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyApiKey } from '@/lib/utils/api-auth'

export async function GET(req: NextRequest) {
  const apiKey = await verifyApiKey(req)
  if (!apiKey) return NextResponse.json({ ok: false, error: 'API Key inválida o no enviada' }, { status: 401 })

  const stores = await prisma.store.findMany({
    where:   { isActive: true },
    select:  { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ ok: true, data: stores })
}
