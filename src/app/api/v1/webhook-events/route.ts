export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyApiKey } from '@/lib/utils/api-auth'

// GET /api/v1/webhook-events?orderId=xxx
export async function GET(req: NextRequest) {
  const apiKey = await verifyApiKey(req)
  if (!apiKey) return NextResponse.json({ ok: false, error: 'API Key inválida o no enviada' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const orderId = searchParams.get('orderId') ?? undefined
  const success  = searchParams.get('success')
  const page     = Number(searchParams.get('page') ?? 1)
  const pageSize = Math.min(Number(searchParams.get('pageSize') ?? 20), 100)

  const where: any = { apiKeyId: apiKey.id }
  if (orderId) where.orderId = orderId
  if (success === 'true')  where.success = true
  if (success === 'false') where.success = false

  const [items, total] = await Promise.all([
    prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, orderId: true, event: true, url: true,
        statusCode: true, success: true, attempt: true,
        errorMessage: true, createdAt: true,
      },
    }),
    prisma.webhookEvent.count({ where }),
  ])

  return NextResponse.json({ ok: true, data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } })
}
