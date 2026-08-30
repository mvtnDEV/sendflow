export const dynamic = 'force-dynamic'

import { redirect }      from 'next/navigation'
import { getSessionUser } from '@/lib/utils/auth'
import { prisma }         from '@/lib/db/prisma'
import { listAlerts }     from '@/lib/services/alert.service'
import AlertasClient      from './client'

export default async function AlertasPage() {
  const user = await getSessionUser()

  // Solo SUPER_ADMIN ve las alertas operativas
  if (!user || user.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const alerts   = await listAlerts({ status: 'ACTIVE' })
  const storeIds = [...new Set(alerts.map(a => a.storeId).filter(Boolean))] as string[]
  const stores   = storeIds.length
    ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
    : []
  const storeName = new Map(stores.map(s => [s.id, s.name]))

  const rows = alerts.map(a => ({
    ...a,
    firstSeenAt: a.firstSeenAt.toISOString(),
    lastSeenAt:  a.lastSeenAt.toISOString(),
    resolvedAt:  a.resolvedAt?.toISOString() ?? null,
    storeName:   a.storeId ? storeName.get(a.storeId) ?? null : null,
  }))

  return <AlertasClient initial={rows as any} />
}
