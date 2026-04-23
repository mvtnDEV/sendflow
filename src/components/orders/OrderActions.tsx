'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const NEXT_STATUSES: Record<string, { status: string; label: string; primary?: boolean }[]> = {
  PENDING:    [{ status: 'RECEIVED',   label: 'Recepcionar en bodega', primary: true }],
  RECEIVED:   [{ status: 'IN_TRANSIT', label: 'Marcar en camino',      primary: true }],
  IN_TRANSIT: [{ status: 'DELIVERED',  label: 'Marcar como entregado', primary: true }, { status: 'INCIDENT', label: 'Reportar incidencia' }],
  INCIDENT:   [{ status: 'IN_TRANSIT', label: 'Reintentar entrega',    primary: true }],
  DELIVERED:  [],
  CANCELLED:  [],
}

export default function OrderActions({
  orderId,
  currentStatus,
}: {
  orderId:       string
  currentStatus: string
}) {
  const router   = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error,   setError]   = useState('')
  const actions = NEXT_STATUSES[currentStatus] ?? []

  async function changeStatus(status: string) {
    setLoading(status)
    setError('')
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      router.refresh()
    } catch (e: any) {
      setError(e.message ?? 'Error actualizando estado')
    } finally {
      setLoading(null)
    }
  }

  if (actions.length === 0) return null

  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Acciones</div>

      {error && (
        <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#9F1239', marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map(action => (
          <button
            key={action.status}
            onClick={() => changeStatus(action.status)}
            disabled={!!loading}
            style={{
              padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              border: action.primary ? 'none' : '1px solid #E2E8F0',
              background: action.primary
                ? (loading === action.status ? '#93C5FD' : '#2563EB')
                : 'white',
              color: action.primary ? 'white' : '#374151',
              opacity: loading && loading !== action.status ? 0.5 : 1,
            }}
          >
            {loading === action.status ? 'Actualizando...' : action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
