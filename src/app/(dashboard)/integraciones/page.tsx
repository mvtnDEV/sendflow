export const dynamic = 'force-dynamic'

import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import IntegracionesClient from './client'

export default async function IntegracionesPage() {
  const user   = await getSessionUser()
  const stores = await prisma.store.findMany({
    where: user?.role === 'SUPER_ADMIN' ? {} : { id: user?.storeId ?? '' },
    include: {
      integrations: {
        select: { id: true, platform: true, isActive: true, lastSyncAt: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  return <IntegracionesClient stores={stores} />
}
