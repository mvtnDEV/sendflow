import { redirect } from 'next/navigation'
import { sanitizeCode } from '@/lib/services/tracking.service'

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
    <div
      style={{
        background: '#111F35',
        border: '1px solid #1E2F4A',
        borderRadius: 14,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 500, color: 'white' }}>Busca tu pedido</div>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: '6px 0 18px', lineHeight: 1.5 }}>
        Ingresa el número de pedido o el código que aparece en la etiqueta del paquete.
      </p>

      <form action="/track" method="get" style={{ display: 'flex', gap: 8 }}>
        <input
          name="codigo"
          required
          autoComplete="off"
          placeholder="Ej: SH-00042"
          style={{
            flex: 1,
            padding: '12px 14px',
            border: '1px solid #2A3E5C',
            background: '#0B1628',
            color: '#E2E8F0',
            borderRadius: 10,
            fontSize: 15,
            outline: 'none',
            fontFamily: 'inherit',
            minWidth: 0,
          }}
        />
        <button
          type="submit"
          style={{
            padding: '12px 18px',
            background: '#2563EB',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          Buscar
        </button>
      </form>
    </div>
  )
}
