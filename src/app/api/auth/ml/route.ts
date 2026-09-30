export const dynamic = 'force-dynamic'
export const fetchCache = "force-no-store"; // nunca usar la caché de datos de Next con APIs externas (ML)
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId   = process.env.ML_CLIENT_ID
  const redirectUri = `${process.env.APP_URL}/api/auth/ml/callback`
  const storeId    = req.nextUrl.searchParams.get('state') ?? ''

  const url = `https://auth.mercadolibre.cl/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${storeId}`

  return NextResponse.redirect(url)
}
