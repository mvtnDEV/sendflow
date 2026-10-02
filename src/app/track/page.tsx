import { redirect } from 'next/navigation'
import { sanitizeCode } from '@/lib/services/tracking.service'
import s from './track.module.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Seguimiento de pedido · Moovex',
  description: 'Consulta el estado de tu envío con tu número de pedido.',
}

// Buscador para quien llega sin código en la URL. Form GET, sin JS de cliente.
export default function TrackSearchPage({
  searchParams,
}: {
  searchParams: { codigo?: string }
}) {
  const codigo = sanitizeCode(searchParams.codigo ?? '')
  if (codigo) redirect(`/track/${encodeURIComponent(codigo)}`)

  return (
    <section className={s.hero}>
      <span className={s.eyebrow}>Seguimiento de envíos</span>
      <h1 className={s.searchTitle}>
        ¿Dónde está <em>tu pedido</em>?
      </h1>
      <p className={s.help}>
        Ingresa el número de pedido o el código que aparece en la etiqueta del paquete.
      </p>

      <form action="/track" method="get" className={s.searchForm}>
        <label htmlFor="codigo" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Número de pedido o código
        </label>
        <input
          id="codigo"
          name="codigo"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Ej: SH-00042"
          className={`${s.input} ${s.mono}`}
        />
        <button type="submit" className={s.btn}>
          Buscar pedido
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </form>

      <ul className={s.hintList}>
        <li>Si la tienda te envió un link de seguimiento, ábrelo directo.</li>
        <li>O escanea el código QR de la etiqueta con la cámara de tu celular.</li>
      </ul>
    </section>
  )
}
