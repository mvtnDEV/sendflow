export const dynamic = 'force-dynamic'

import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import TiendasClient from './client'

const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:'Shopify', MERCADOLIBRE:'ML Flex',
  WOOCOMMERCE:'WooCommerce', JUMPSELLER:'Jumpseller', MANUAL:'Manual',
}

export default async function TiendasPage() {
  const user = await getSessionUser()
  const where = user?.role === 'SUPER_ADMIN' ? {} : { id: user?.storeId ?? '' }

  const stores = await prisma.store.findMany({
    where,
    include: {
      integrations: {
        select: { id: true, platform: true, isActive: true, lastSyncAt: true },
      },
      _count: { select: { orders: true } },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <TiendasClient
      stores={stores as any}
      isSuperAdmin={user?.role === 'SUPER_ADMIN'}
      platformLabel={PLATFORM_LABEL}
    />
  )
}
