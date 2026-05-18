export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { encrypt } from '@/lib/utils/crypto'

export async function GET(req: NextRequest) {
  const code    = req.nextUrl.searchParams.get('code')
  const storeId = req.nextUrl.searchParams.get('state')

  if (!code) {
    return NextResponse.redirect(`${process.env.APP_URL}/integraciones?error=ml_no_code`)
  }

  try {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     process.env.ML_CLIENT_ID!,
        client_secret: process.env.ML_CLIENT_SECRET!,
        code,
        redirect_uri:  `${process.env.APP_URL}/api/auth/ml/callback`,
      }),
    })

    const tokens = await res.json()
    if (!tokens.access_token) throw new Error('No access token')

    const userRes = await fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const mlUser = await userRes.json()

    // Guardar como pipe: "accessToken|refreshToken" — mismo formato que lee el webhook
    const credentials = `${tokens.access_token}|${tokens.refresh_token}`

    if (storeId) {
      await prisma.storeIntegration.upsert({
        where:  { storeId_platform: { storeId, platform: 'MERCADOLIBRE' } },
        update: {
          apiKeyEnc:       encrypt(credentials),
          externalStoreId: String(mlUser.id),
          isActive:        true,
          lastSyncAt:      new Date(),
        },
        create: {
          storeId,
          platform:        'MERCADOLIBRE',
          apiKeyEnc:       encrypt(credentials),
          externalStoreId: String(mlUser.id),
          isActive:        true,
          lastSyncAt:      new Date(),
        },
      })
    }

    return NextResponse.redirect(`${process.env.APP_URL}/integraciones?success=ml`)
  } catch (err) {
    console.error('[ML OAuth callback]', err)
    return NextResponse.redirect(`${process.env.APP_URL}/integraciones?error=ml_auth_failed`)
  }
}
