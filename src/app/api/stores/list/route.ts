export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }
  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ ok: true, data: stores })
}
