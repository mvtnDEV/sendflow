import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export interface ApiKeyPayload {
  id:      string
  name:    string
  storeId: string | null
}

const RATE_LIMIT_MAX    = 500  // requests
const RATE_LIMIT_WINDOW = 60   // segundos

export async function verifyApiKey(req: NextRequest): Promise<ApiKeyPayload | null> {
  const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (!key) return null

  const apiKey = await prisma.apiKey.findUnique({
    where: { key, isActive: true },
  })
  if (!apiKey) return null

  // Rate limiting
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW * 1000)
  const count = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM api_rate_limits
    WHERE key = ${key} AND created_at > ${since}
  `
  const requests = Number(count[0]?.count ?? 0)
  if (requests >= RATE_LIMIT_MAX) return null

  // Registrar request
  await prisma.$executeRaw`
    INSERT INTO api_rate_limits (key, created_at) VALUES (${key}, NOW())
  `

  // Limpiar registros antiguos cada 100 requests
  if (requests % 100 === 0) {
    await prisma.$executeRaw`
      DELETE FROM api_rate_limits WHERE created_at < NOW() - INTERVAL '1 hour'
    `
  }

  // Actualizar lastUsedAt
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data:  { lastUsedAt: new Date() },
  })

  return { id: apiKey.id, name: apiKey.name, storeId: apiKey.storeId }
}
