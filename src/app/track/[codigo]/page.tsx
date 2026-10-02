import { cache } from 'react'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getPublicTracking, STATUS_LABEL } from '@/lib/services/tracking.service'
import { checkRateLimit, clientIp }        from '@/lib/utils/rate-limit'
import { TrackView, Aviso, STATUS_HELP }  from '../TrackView'

export const dynamic = 'force-dynamic'

const MAX_POR_MINUTO = 30

// generateMetadata y la página piden el mismo pedido: una sola consulta.
const buscar = cache((codigo: string) => getPublicTracking(decodeURIComponent(codigo)))

export async function generateMetadata(
  { params }: { params: { codigo: string } },
): Promise<Metadata> {
  const data = await buscar(params.codigo)
  if (!data) {
    return { title: 'Pedido no encontrado · Moovex' }
  }
  return {
    title:       `Pedido ${data.orderNumber} · ${STATUS_LABEL[data.status]} · Moovex`,
    description: STATUS_HELP[data.status],
    openGraph: {
      title:       `Pedido ${data.orderNumber} · ${STATUS_LABEL[data.status]}`,
      description: STATUS_HELP[data.status],
      siteName:    'Moovex',
    },
  }
}

export default async function TrackPage({ params }: { params: { codigo: string } }) {
  // La página server-rendered es tan enumerable como la API: mismo límite.
  const permitido = await checkRateLimit(`track:${clientIp(headers())}`, MAX_POR_MINUTO, 60)
  if (!permitido) {
    return <Aviso titulo="Demasiadas consultas" texto="Espera un minuto antes de volver a buscar." />
  }

  const data = await buscar(params.codigo)

  // Mismo mensaje para "no existe" y "no autorizado"
  if (!data) {
    return (
      <Aviso
        titulo="No encontramos ese pedido"
        texto="Revisa que el código esté bien escrito. Si acabas de comprar, puede que aún no esté registrado: vuelve a intentar en unas horas."
      />
    )
  }

  return <TrackView data={data} />
}
