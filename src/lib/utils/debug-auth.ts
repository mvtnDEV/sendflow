import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/utils/auth'

/**
 * Guardia para rutas /api/debug/*: SUPER_ADMIN con sesión iniciada, o el
 * CRON_SECRET (Bearer o ?key=), igual que /api/debug/send-now.
 */
export async function autorizadoDebug(req: NextRequest | Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const bearer = req.headers.get('authorization')
    const key    = new URL(req.url).searchParams.get('key')
    if (bearer === `Bearer ${secret}` || key === secret) return true
  }
  const user = await getSessionUser()
  return user?.role === 'SUPER_ADMIN'
}
