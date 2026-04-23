import { getSessionUser } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import ConductoresClient from './client'
import { redirect } from 'next/navigation'

export default async function ConductoresPage() {
  const user = await getSessionUser()
  if (!user || user.role === 'STORE_ADMIN') redirect('/dashboard')

  const drivers = await prisma.user.findMany({
    where:   { role: 'DRIVER' },
    select:  { id:true, name:true, email:true, phone:true, isActive:true, lastLoginAt:true, storeId:true },
    orderBy: { name: 'asc' },
  })

  const stores = await prisma.store.findMany({
    where:   user.role === 'SUPER_ADMIN' ? {} : { id: user.storeId ?? '' },
    select:  { id:true, name:true },
    orderBy: { name: 'asc' },
  })

  return <ConductoresClient drivers={drivers} stores={stores} />
}
