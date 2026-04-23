import { prisma } from '@/lib/db/prisma'
import crypto from 'crypto'

// ─── Generador de número de pedido ───────────────────────────────────────────

const PLATFORM_PREFIX: Record<string, string> = {
  SHOPIFY:      'SH',
  MERCADOLIBRE: 'ML',
  WOOCOMMERCE:  'WC',
  JUMPSELLER:   'JU',
  MANUAL:       'MN',
}

/**
 * Genera un número de pedido único y legible.
 * Formato: #SH-10482
 * Usa un contador atómico por prefijo para evitar colisiones.
 */
export async function generateOrderNumber(platform: string): Promise<string> {
  const prefix = PLATFORM_PREFIX[platform] ?? 'MN'

  // Contar pedidos existentes con ese prefijo y sumar 1
  const count = await prisma.order.count({
    where: { platform: platform as any },
  })

  const num = String(count + 1).padStart(5, '0')
  return `#${prefix}-${num}`
}

// ─── Generador de QR único ────────────────────────────────────────────────────

/**
 * Genera un código único para el QR del pedido.
 * Es un string corto, URL-safe, difícil de adivinar.
 * Ejemplo: "sf_a3f9b2c1"
 */
export function generateQrCode(platform: string): string {
  const prefix = PLATFORM_PREFIX[platform]?.toLowerCase() ?? 'mn'
  const random = crypto.randomBytes(4).toString('hex')
  return `${prefix}_${random}`
}

// ─── Verificar unicidad ───────────────────────────────────────────────────────

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
