export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser }            from '@/lib/utils/auth'
import { resolveAlert }              from '@/lib/services/alert.service'
import { audit }                     from '@/lib/services/audit.service'
import { prisma }                    from '@/lib/db/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser()
  if (!me || me.role !== 'SUPER_ADMIN')
    return NextResponse.json({ ok: false, error: 'Solo Super Admin puede resolver alertas' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  const existing = await prisma.alert.findUnique({ where: { id: params.id } })
  if (!existing)
    return NextResponse.json({ ok: false, error: 'Alerta no encontrada' }, { status: 404 })

  if (existing.status === 'RESOLVED')
    return NextResponse.json({ ok: true, data: existing, alreadyResolved: true })

  const alert = await resolveAlert(params.id, me.id, note)

  await audit({
    userId:   me.id,
    action:   'RESOLVE_ALERT',
    resource: `alert:${params.id}`,
    metadata: { type: alert.type, orderNumber: alert.orderNumber, note },
  })

  return NextResponse.json({ ok: true, data: alert })
}
