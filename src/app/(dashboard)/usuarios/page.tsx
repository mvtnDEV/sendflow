export const dynamic = 'force-dynamic'

import { redirect }        from 'next/navigation'
import { getSessionUser }   from '@/lib/utils/auth'
import { prisma }           from '@/lib/db/prisma'
import UsuariosClient       from './client'

export default async function UsuariosPage() {
  const user = await getSessionUser()

  // Solo SUPER_ADMIN puede gestionar usuarios
  if (!user || user.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const [users, stores] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id:          true,
        name:        true,
        email:       true,
        role:        true,
        phone:       true,
        isActive:    true,
        createdAt:   true,
        lastLoginAt: true,
        storeId:     true,
        store:       { select: { id: true, name: true } },
      },
    }),
    prisma.store.findMany({
      where:   { isActive: true },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return <UsuariosClient users={users as any} stores={stores} currentUserId={user.id} />
}
