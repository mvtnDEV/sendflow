import { redirect } from 'next/navigation'
import { sanitizeCode } from '@/lib/services/tracking.service'

export const dynamic = 'force-dynamic'

/**
 * Ruta antigua del tracking público. Sigue viva porque hay etiquetas ya
 * impresas cuyo QR apunta acá. Redirige a /track sin perder el código.
 */
export default function TrackingPublicPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const codigo = sanitizeCode(searchParams.q ?? '')
  redirect(codigo ? `/track/${encodeURIComponent(codigo)}` : '/track')
}
