import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { checkRateLimit } from '@/lib/utils/rate-limit'

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

  // Rate limiting.
  // Antes esto consultaba `api_rate_limits.key`, columna que el modelo
  // ApiRateLimit no tiene (define apiKeyId): reventaba en runtime y tumbaba
  // toda la API v1. Ahora usa el helper genérico sobre rate_limit_hits.
  const permitido = await checkRateLimit(`apikey:${apiKey.id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW)
  if (!permitido) return null

  // lastUsedAt es informativo: se actualiza como máximo una vez por minuto
  // para no escribir en la base de datos en cada request.
  const hace1min = Date.now() - 60 * 1000
  if (!apiKey.lastUsedAt || apiKey.lastUsedAt.getTime() < hace1min) {
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data:  { lastUsedAt: new Date() },
    })
  }

  return { id: apiKey.id, name: apiKey.name, storeId: apiKey.storeId }
}
