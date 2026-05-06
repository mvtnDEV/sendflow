export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'

// DELETE /api/api-keys/:id — revocar API Key
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  await prisma.apiKey.update({
    where: { id: params.id },
    data:  { isActive: false },
  })

  return NextResponse.json({ ok: true })
}
