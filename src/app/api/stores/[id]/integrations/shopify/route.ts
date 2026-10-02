export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import { encrypt } from '@/lib/utils/crypto'
import {
  normalizeShopDomain, testShopifyConnection, registerShopifyWebhooks, ShopifyError,
} from '@/lib/integrations/shopify'

/**
 * POST /api/stores/[id]/integrations/shopify — conectar Shopify en un paso.
 *
 * Body: { domain, clientId, clientSecret }
 * Valida credenciales y permisos contra Shopify, registra los webhooks de
 * pedidos y recién ahí guarda la integración. Si algo falla no se guarda nada
 * y se devuelve un mensaje que la tienda puede entender.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  if (user.role === 'VIEWER') return NextResponse.json({ ok: false, error: 'Sin permisos — modo solo lectura' }, { status: 403 })
  if (!canAccessStore(user, params.id)) return NextResponse.json({ ok: false, error: 'Sin acceso' }, { status: 403 })

  const body         = await req.json().catch(() => null)
  const clientId     = String(body?.clientId ?? '').trim()
  const clientSecret = String(body?.clientSecret ?? '').trim()
  const domain       = normalizeShopDomain(String(body?.domain ?? ''))

  if (!domain) {
    return NextResponse.json({ ok: false, error: 'El dominio debe ser tu dirección .myshopify.com (ej: mi-tienda.myshopify.com).' }, { status: 400 })
  }
  if (!clientId || !clientSecret) {
    return NextResponse.json({ ok: false, error: 'Faltan el Client ID o el Client secret.' }, { status: 400 })
  }

  const appUrl = (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/$/, '')
  if (!appUrl.startsWith('https://')) {
    return NextResponse.json({ ok: false, error: 'Shopify solo envía webhooks a una URL https. Conecta desde el sitio publicado, no desde localhost.' }, { status: 400 })
  }

  // Un dominio Shopify solo puede alimentar a una tienda de SendFlow: si no,
  // el webhook no sabría a cuál asignar el pedido.
  const enOtraTienda = await prisma.storeIntegration.findFirst({
    where:  { platform: 'SHOPIFY', externalStoreId: domain, isActive: true, storeId: { not: params.id } },
    select: { id: true },
  })
  if (enOtraTienda) {
    return NextResponse.json({ ok: false, error: `${domain} ya está conectada a otra tienda en SendFlow.` }, { status: 409 })
  }

  try {
    const { token, shopName } = await testShopifyConnection(domain, clientId, clientSecret)
    await registerShopifyWebhooks(domain, token, `${appUrl}/api/webhooks/shopify`)

    const data = {
      apiKeyEnc:       encrypt([domain, clientId, clientSecret].join('|')),
      externalStoreId: domain,
      webhookSecret:   clientSecret,   // Shopify firma los webhooks de la app con el Client secret
      isActive:        true,
    }
    await prisma.storeIntegration.upsert({
      where:  { storeId_platform: { storeId: params.id, platform: 'SHOPIFY' } },
      create: { storeId: params.id, platform: 'SHOPIFY', ...data },
      update: data,
    })

    return NextResponse.json({ ok: true, data: { domain, shopName } })
  } catch (err) {
    if (err instanceof ShopifyError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 })
    }
    console.error('[Shopify connect]', domain, err)
    return NextResponse.json({ ok: false, error: 'Error inesperado al conectar. Intenta de nuevo.' }, { status: 500 })
  }
}
