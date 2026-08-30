import { prisma } from '@/lib/db/prisma'

/**
 * Rate limiting genérico por "bucket" (ej: "track:1.2.3.4", "apikey:abc123").
 *
 * Prisma puro, sin SQL crudo. Devuelve true si la request está permitida.
 * Si la consulta falla (DB caída, etc.) devuelve true: preferimos servir de
 * más antes que dejar el tracking caído por el contador.
 */
export async function checkRateLimit(
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowSeconds * 1000)

    const hits = await prisma.rateLimitHit.count({
      where: { bucket, createdAt: { gt: since } },
    })

    if (hits >= max) return false

    await prisma.rateLimitHit.create({ data: { bucket } })

    // Limpieza oportunista, mismo criterio que el api-auth original:
    // cada ~100 hits se borra lo que ya no sirve para ninguna ventana.
    if (hits > 0 && hits % 100 === 0) {
      await prisma.rateLimitHit.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
      })
    }

    return true
  } catch (err) {
    console.error('[RateLimit error]', err)
    return true
  }
}

/**
 * IP del cliente detrás del proxy de Vercel. Mismo criterio que audit.service.
 * Acepta tanto los Headers de una Request como los de next/headers.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  )
}
