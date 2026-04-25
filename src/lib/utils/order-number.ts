import { prisma } from '@/lib/db/prisma'
import crypto from 'crypto'

/**
 * Genera un número de pedido único de 6 dígitos numéricos aleatorios.
 * Formato: #847291
 * Verifica unicidad en la DB para evitar colisiones.
 */
export async function generateOrderNumber(platform: string): Promise<string> {
  let orderNumber: string
  let exists = true

  do {
    // Generar 6 dígitos numéricos aleatorios
    const num = Math.floor(100000 + Math.random() * 900000)
    orderNumber = `#${num}`
    const found = await prisma.order.findFirst({
      where: { orderNumber },
      select: { id: true },
    })
    exists = !!found
  } while (exists)

  return orderNumber
}

// ─── Generador de QR único ────────────────────────────────────────────────────
export function generateQrCode(platform: string): string {
  const PLATFORM_PREFIX: Record<string, string> = {
    SHOPIFY:      'sh',
    MERCADOLIBRE: 'ml',
    WOOCOMMERCE:  'wc',
    JUMPSELLER:   'ju',
    MANUAL:       'mn',
  }
  const prefix = PLATFORM_PREFIX[platform?.toUpperCase()] ?? 'mn'
  const random = crypto.randomBytes(4).toString('hex')
  return `${prefix}_${random}`
}

// ─── Verificar unicidad del QR ────────────────────────────────────────────────
export async function ensureUniqueQrCode(platform: string): Promise<string> {
  let code: string
  let exists = true
  do {
    code = generateQrCode(platform)
    const found = await prisma.order.findUnique({ where: { qrCode: code } })
    exists = !!found
  } while (exists)
  return code
}
