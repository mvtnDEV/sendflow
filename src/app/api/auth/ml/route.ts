export const dynamic = 'force-dynamic'
export const fetchCache = "force-no-store"; // nunca usar la caché de datos de Next con APIs externas (ML)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { canAccessStore, canWrite, getSessionUser } from '@/lib/utils/auth'
import { COOKIE_ML_OAUTH, COOKIE_ML_OAUTH_MAX_AGE, crearEstadoML } from '@/lib/integrations/ml-oauth-state'

// Inicio de la conexión con Mercado Libre. Exige sesión y acceso a la tienda: el middleware
// del proyecto deja /api/auth/* sin filtrar (por NextAuth), así que se comprueba acá.
export async function GET(req: NextRequest) {
  const base = process.env.APP_URL

  const user = await getSessionUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const storeId = req.nextUrl.searchParams.get('state') ?? ''
  const tienda = storeId
    ? await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } })
    : null

  if (!tienda || !canWrite(user) || !canAccessStore(user, storeId)) {
    return NextResponse.redirect(`${base}/integraciones?error=ml_sin_permiso`)
  }

  const { state, nonce } = crearEstadoML(storeId)
  const redirectUri = `${base}/api/auth/ml/callback`
  const url =
    `https://auth.mercadolibre.cl/authorization?response_type=code` +
    `&client_id=${process.env.ML_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`

  const res = NextResponse.redirect(url)
  // El código del state también va en una cookie: el callback exige que coincidan.
  res.cookies.set(COOKIE_ML_OAUTH, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // se envía en la redirección de vuelta desde ML (navegación de nivel superior)
    path: '/api/auth/ml',
    maxAge: COOKIE_ML_OAUTH_MAX_AGE,
  })
  return res
}
