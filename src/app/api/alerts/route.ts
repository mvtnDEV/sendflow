export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser }            from '@/lib/utils/auth'
import { listAlerts, TIPOS_ACTIVOS } from '@/lib/services/alert.service'
import { prisma }                    from '@/lib/db/prisma'
import type { AlertStatus, AlertType } from '@prisma/client'

const TIPOS_VALIDOS: AlertType[] = TIPOS_ACTIVOS
const ESTADOS_VALIDOS: AlertStatus[] = ['ACTIVE', 'RESOLVED']

export async function GET(req: NextRequest) {
  const me = await getSessionUser()
  if (!me || me.role !== 'SUPER_ADMIN')
    return NextResponse.json({ ok: false, error: 'Solo Super Admin puede ver las alertas' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const statusParam  = searchParams.get('status')  as AlertStatus | null
  const typeParam    = searchParams.get('type')    as AlertType   | null
  const storeIdParam = searchParams.get('storeId')

  const alerts = await listAlerts({
    status:  statusParam && ESTADOS_VALIDOS.includes(statusParam) ? statusParam : 'ACTIVE',
    type:    typeParam   && TIPOS_VALIDOS.includes(typeParam)     ? typeParam   : undefined,
    storeId: storeIdParam || undefined,
  })

  // Nombre de tienda para mostrar en el panel (vista interna de SUPER_ADMIN)
  const storeIds = [...new Set(alerts.map(a => a.storeId).filter(Boolean))] as string[]
  const stores   = storeIds.length
    ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
    : []
  const storeName = new Map(stores.map(s => [s.id, s.name]))

  return NextResponse.json({
    ok:   true,
    data: alerts.map(a => ({ ...a, storeName: a.storeId ? storeName.get(a.storeId) ?? null : null })),
  })
}
