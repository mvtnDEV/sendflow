'use client'

import { useState } from 'react'

const STATUS_LABEL: Record<string, string> = {
  PENDING:'Pedido creado', RECEIVED:'Recepcionado en bodega',
  IN_TRANSIT:'En camino al destino', DELIVERED:'Entregado', INCIDENT:'Incidencia', CANCELLED:'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING:'#F59E0B', RECEIVED:'#2563EB', IN_TRANSIT:'#16A34A', DELIVERED:'#7C3AED', INCIDENT:'#E11D48',
}

export default function TrackingPage() {
  const [query,   setQuery]   = useState('')
  const [result,  setResult]  = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const param = query.startsWith('#') ? `id=${encodeURIComponent(query)}` : `qr=${encodeURIComponent(query)}`
      const res   = await fetch(`/api/tracking?${param}`)
      const data  = await res.json()
      if (!data.ok) throw new Error(data.error)
      setResult(data.data)
    } catch (e: any) {
      setError(e.message ?? 'Pedido no encontrado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Tracking de pedido</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>Consulta el estado en tiempo real de cualquier envío</p>
      </div>

      {/* Buscador */}
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Buscar por N° pedido o código QR</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 18 }}>Ej: #SH-00042 o el código del QR escaneado</div>
        <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ingresa el N° de pedido..."
            style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
          <button type="submit" disabled={loading} style={{ padding: '10px 18px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            {loading ? '...' : 'Buscar'}
          </button>
        </form>
        {error && <div style={{ marginTop: 12, fontSize: 13, color: '#9F1239', background: '#FFF1F2', borderRadius: 8, padding: '8px 14px' }}>{error}</div>}
      </div>

      {/* Resultado */}
      {result && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 3 }}>Pedido</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#1D4ED8' }}>{result.orderNumber}</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{result.customerName}</div>
            </div>
            <span style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: STATUS_COLOR[result.status] + '20', color: STATUS_COLOR[result.status] }}>
              {STATUS_LABEL[result.status]}
            </span>
          </div>

          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 14, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
              <div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Destino</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{result.comuna}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Bultos</div>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{result.bultos}</div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: '#E2E8F0' }} />
            {result.timeline.map((ev: any, i: number) => {
              const isLast = i === result.timeline.length - 1
              const color  = STATUS_COLOR[ev.status] ?? '#6B7280'
              return (
                <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 20 }}>
                  <div style={{
                    position: 'absolute', left: -20, top: 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: isLast ? color : '#2563EB',
                    border: `2px solid ${isLast ? color : '#2563EB'}`,
                    zIndex: 1,
                  }}/>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{STATUS_LABEL[ev.status] ?? ev.status}</div>
                  {ev.text && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{ev.text}</div>}
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{ev.formatted}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
