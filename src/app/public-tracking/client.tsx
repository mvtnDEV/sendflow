'use client'
import { useState, useEffect } from 'react'

const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pedido creado',
  RECEIVED:   'Recepcionado en bodega',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'Incidencia',
  CANCELLED:  'Cancelado',
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string; step: number }> = {
  PENDING:    { color: '#92400E', bg: '#FFFBEB', icon: '📋', step: 1 },
  RECEIVED:   { color: '#1D4ED8', bg: '#EFF6FF', icon: '📦', step: 2 },
  IN_TRANSIT: { color: '#5B21B6', bg: '#F5F3FF', icon: '🚚', step: 3 },
  DELIVERED:  { color: '#166534', bg: '#F0FDF4', icon: '✅', step: 4 },
  INCIDENT:   { color: '#9F1239', bg: '#FFF1F2', icon: '⚠️', step: 0 },
  CANCELLED:  { color: '#475569', bg: '#F1F5F9', icon: '❌', step: 0 },
}

const STEPS = [
  { key: 'PENDING',    label: 'Creado',    icon: '📋' },
  { key: 'RECEIVED',   label: 'En bodega', icon: '📦' },
  { key: 'IN_TRANSIT', label: 'En camino', icon: '🚚' },
  { key: 'DELIVERED',  label: 'Entregado', icon: '✅' },
]

interface OrderData {
  orderNumber:    string
  status:         string
  customerName:   string
  address:        string
  storeName:      string
  bultos:         number
  createdAt:      string | null
  receivedAt:     string | null
  inTransitAt:    string | null
  deliveredAt:    string | null
  evidencePhoto1: string | null
  evidencePhoto2: string | null
  evidenceNote:   string | null
  timeline: { status: string; note: string | null; formatted: string | null }[]
}

export default function TrackingPublicClient({ initialQuery }: { initialQuery: string }) {
  const [query,   setQuery]   = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [order,   setOrder]   = useState<OrderData | null>(null)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (initialQuery) handleSearch(initialQuery)
  }, [])

  async function handleSearch(q?: string) {
    const searchQ = (q || query).trim()
    if (!searchQ) return
    setLoading(true); setError(''); setOrder(null)
    try {
      const res  = await fetch(`/api/tracking?q=${encodeURIComponent(searchQ)}`)
      const data = await res.json()
      if (data.ok) setOrder(data.data)
      else setError('Pedido no encontrado. Verifica el número e intenta de nuevo.')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const cfg = order ? (STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING) : null
  const currentStep = cfg?.step ?? 0

  return (
    <div style={{ minHeight:'100vh', background:'#F0F4F8', fontFamily:'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background:'#0B1628', padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontSize:22, fontWeight:700, color:'white', letterSpacing:'-0.5px' }}>
          SEND<span style={{ color:'#3B82F6' }}>FLOW</span>
        </div>
        <div style={{ fontSize:13, color:'#64748B', marginLeft:4 }}>· Rastreo de pedido</div>
      </div>

      <div style={{ maxWidth:600, margin:'0 auto', padding:'32px 16px' }}>
        {/* Buscador */}
        <div style={{ background:'white', borderRadius:16, padding:24, marginBottom:20, boxShadow:'0 2px 12px rgba(0,0,0,.08)' }}>
          <div style={{ fontSize:22, fontWeight:600, marginBottom:6, color:'#0B1628' }}>Rastrea tu pedido</div>
          <div style={{ fontSize:14, color:'#64748B', marginBottom:20 }}>
            Ingresa tu número de pedido para ver el estado en tiempo real
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Ej: #847291"
              style={{ flex:1, padding:'12px 16px', border:'1.5px solid #E2E8F0', borderRadius:10, fontSize:15, outline:'none', fontFamily:'inherit', letterSpacing:'0.5px' }}
            />
            <button onClick={() => handleSearch()} disabled={loading}
              style={{ padding:'12px 22px', background:loading?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer', whiteSpace:'nowrap' }}>
              {loading ? 'Buscando...' : 'Rastrear'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:'#FFF1F2', border:'1px solid #FECDD3', borderRadius:12, padding:'16px 20px', marginBottom:20, fontSize:14, color:'#9F1239' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Resultado */}
        {order && cfg && (
          <>
            {/* Estado principal */}
            <div style={{ background:'white', borderRadius:16, padding:24, marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,.08)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:13, color:'#64748B', marginBottom:4 }}>Pedido</div>
                  <div style={{ fontSize:22, fontWeight:700, color:'#0B1628' }}>{order.orderNumber}</div>
                  <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>{order.storeName}</div>
                </div>
                <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:30, fontSize:14, fontWeight:600, background:cfg.bg, color:cfg.color }}>
                  {cfg.icon} {STATUS_LABEL[order.status]}
                </span>
              </div>

              {/* Barra de progreso */}
              {currentStep > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    {STEPS.map((step, i) => {
                      const done   = currentStep > i + 1
                      const active = currentStep === i + 1
                      return (
                        <div key={step.key} style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1 }}>
                          <div style={{
                            width:38, height:38, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:16,
                            background: done ? '#2563EB' : active ? cfg.bg : '#F1F5F9',
                            border: active ? `2px solid ${cfg.color}` : done ? '2px solid #2563EB' : '2px solid #E2E8F0',
                            marginBottom:6,
                          }}>
                            {done ? '✓' : step.icon}
                          </div>
                          <div style={{ fontSize:10, color:active?cfg.color:done?'#2563EB':'#94A3B8', fontWeight:active||done?600:400, textAlign:'center' }}>
                            {step.label}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ height:4, background:'#F1F5F9', borderRadius:4, position:'relative', marginTop:4 }}>
                    <div style={{ height:'100%', background:'#2563EB', borderRadius:4, width:`${((currentStep-1)/3)*100}%`, transition:'width .5s ease' }}/>
                  </div>
                </div>
              )}

              {/* Datos del pedido */}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { label:'Cliente',      value: order.customerName },
                  { label:'Dirección',    value: order.address },
                  { label:'Tienda',       value: order.storeName },
                  { label:'Bultos',       value: String(order.bultos) },
                  { label:'Creado',       value: order.createdAt },
                  ...(order.receivedAt  ? [{ label:'Recepcionado', value: order.receivedAt  }] : []),
                  ...(order.inTransitAt ? [{ label:'En camino',    value: order.inTransitAt }] : []),
                  ...(order.deliveredAt ? [{ label:'Entregado',    value: order.deliveredAt }] : []),
                ].filter(r => r.value).map(row => (
                  <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F8FAFC', fontSize:13 }}>
                    <span style={{ color:'#64748B' }}>{row.label}</span>
                    <span style={{ fontWeight:500, color:'#0B1628', textAlign:'right', maxWidth:'60%' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Evidencia de entrega */}
            {order.evidencePhoto1 && (
              <div style={{ background:'white', borderRadius:16, padding:20, marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,.08)' }}>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:14, color:'#166534' }}>📷 Evidencia de entrega</div>
                <div style={{ display:'grid', gridTemplateColumns: order.evidencePhoto2 ? '1fr 1fr' : '1fr', gap:12 }}>
                  <a href={order.evidencePhoto1} target="_blank">
                    <img src={order.evidencePhoto1} alt="Evidencia 1"
                      style={{ width:'100%', borderRadius:10, maxHeight:220, objectFit:'cover', cursor:'pointer', border:'1px solid #E2E8F0' }}/>
                  </a>
                  {order.evidencePhoto2 && (
                    <a href={order.evidencePhoto2} target="_blank">
                      <img src={order.evidencePhoto2} alt="Evidencia 2"
                        style={{ width:'100%', borderRadius:10, maxHeight:220, objectFit:'cover', cursor:'pointer', border:'1px solid #E2E8F0' }}/>
                    </a>
                  )}
                </div>
                {order.evidenceNote && (
                  <div style={{ marginTop:12, background:'#F0FDF4', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#166534' }}>
                    💬 {order.evidenceNote}
                  </div>
                )}
              </div>
            )}

            {/* Historial */}
            <div style={{ background:'white', borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,.08)' }}>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:16, color:'#0B1628' }}>Historial de estados</div>
              <div style={{ position:'relative', paddingLeft:24 }}>
                <div style={{ position:'absolute', left:8, top:0, bottom:0, width:1, background:'#E2E8F0' }}/>
                {order.timeline.map((ev, i) => {
                  const isLast = i === order.timeline.length - 1
                  const evCfg  = STATUS_CONFIG[ev.status] ?? STATUS_CONFIG.PENDING
                  return (
                    <div key={i} style={{ position:'relative', paddingBottom:isLast?0:20 }}>
                      <div style={{ position:'absolute', left:-20, top:2, width:16, height:16, borderRadius:'50%', background:evCfg.color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <div style={{ width:6, height:6, borderRadius:'50%', background:'white' }}/>
                      </div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0B1628' }}>{STATUS_LABEL[ev.status]}</div>
                      {ev.note && <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>{ev.note}</div>}
                      <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{ev.formatted}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <div style={{ textAlign:'center', marginTop:32, fontSize:12, color:'#94A3B8' }}>
          Powered by SendFlow · Sistema de gestión logística
        </div>
      </div>
    </div>
  )
}
