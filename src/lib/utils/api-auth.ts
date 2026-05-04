import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export interface ApiKeyPayload {
  id:      string
  name:    string
  storeId: string | null
}

export async function verifyApiKey(req: NextRequest): Promise<ApiKeyPayload | null> {
  const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (!key) return null

  const apiKey = await prisma.apiKey.findUnique({
    where: { key, isActive: true },
  })

  if (!apiKey) return null

  // Actualizar lastUsedAt
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data:  { lastUsedAt: new Date() },
  })

  return { id: apiKey.id, name: apiKey.name, storeId: apiKey.storeId }
}
