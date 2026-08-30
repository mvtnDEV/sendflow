'use client'
import { useState } from 'react'
import Link from 'next/link'

type AlertType   = 'FLEX_CANCELLED' | 'STUCK_IN_TRANSIT' | 'NOT_SENT_TO_FRET' | 'FRET_NOT_PICKED_UP'
type AlertStatus = 'ACTIVE' | 'RESOLVED'

interface AlertRow {
  id:           string
  type:         AlertType
  status:       AlertStatus
  orderId:      string | null
  orderNumber:  string | null
  storeId:      string | null
  storeName:    string | null
  title:        string
  detail:       string | null
  firstSeenAt:  string
  lastSeenAt:   string
  resolvedAt:   string | null
  resolvedBy:   string | null
  resolvedNote: string | null
}

const TYPE_LABEL: Record<AlertType, string> = {
  FLEX_CANCELLED:     'Flex canceló',
  STUCK_IN_TRANSIT:   'Trabado en camino',
  NOT_SENT_TO_FRET:   'No enviado al operador',
  FRET_NOT_PICKED_UP: 'Sin retirar',
}
const TYPE_STYLE: Record<AlertType, { bg: string; color: string }> = {
  FLEX_CANCELLED:     { bg:'#FEF2F2', color:'#B91C1C' },
  STUCK_IN_TRANSIT:   { bg:'#FFF7ED', color:'#C2410C' },
  NOT_SENT_TO_FRET:   { bg:'#EFF6FF', color:'#1D4ED8' },
  FRET_NOT_PICKED_UP: { bg:'#F5F3FF', color:'#5B21B6' },
}
const TYPE_HELP: Record<AlertType, string> = {
  FLEX_CANCELLED:     'Mercado Libre Flex dejó de gestionar el envío pero el pedido sigue abierto.',
  STUCK_IN_TRANSIT:   'Lleva más de 24 horas en camino sin cerrarse.',
  NOT_SENT_TO_FRET:   'Creado hace más de 2 horas y todavía no tiene número de operador.',
  FRET_NOT_PICKED_UP: 'Asignado al operador hace más de 48 horas y aún no lo retira.',
}

const TIPOS: AlertType[] = ['FLEX_CANCELLED', 'STUCK_IN_TRANSIT', 'NOT_SENT_TO_FRET', 'FRET_NOT_PICKED_UP']

function antiguedad(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60)   return `hace ${Math.max(min, 1)} min`
  const h = Math.floor(min / 60)
  if (h < 48)     return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} días`
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function AlertasClient({ initial }: { initial: AlertRow[] }) {
  const [alerts,   setAlerts]   = useState<AlertRow[]>(initial)
  const [tab,      setTab]      = useState<AlertStatus>('ACTIVE')
  const [tipo,     setTipo]     = useState<AlertType | 'ALL'>('ALL')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [resolving, setResolving] = useState<AlertRow | null>(null)
  const [nota,     setNota]     = useState('')
  const [saving,   setSaving]   = useState(false)

  async function cargar(nextTab: AlertStatus, nextTipo: AlertType | 'ALL') {
    setLoading(true); setError('')
    try {
      const qs  = new URLSearchParams({ status: nextTab })
      if (nextTipo !== 'ALL') qs.set('type', nextTipo)
      const res  = await fetch(`/api/alerts?${qs}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'No se pudieron cargar las alertas')
      setAlerts(data.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function cambiarTab(t: AlertStatus)          { setTab(t);   cargar(t, tipo) }
  function cambiarTipo(t: AlertType | 'ALL')   { setTipo(t);  cargar(tab, t) }

  async function confirmarResolver() {
    if (!resolving) return
    setSaving(true); setError('')
    try {
      const res  = await fetch(`/api/alerts/${resolving.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ note: nota }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'No se pudo resolver')
      setAlerts(a => a.filter(x => x.id !== resolving.id))
      setResolving(null); setNota('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const visibles = alerts.filter(a => tipo === 'ALL' || a.type === tipo)

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Alertas operativas</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>
          Pedidos que necesitan una revisión manual. Se detectan solas cada 30 minutos y se cierran solas cuando el pedido avanza.
        </p>
      </div>

      {/* Tabs estado */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['ACTIVE', 'RESOLVED'] as AlertStatus[]).map(t => (
          <button
            key={t}
            onClick={() => cambiarTab(t)}
            style={{
              padding: '7px 14px',
              border: '1px solid ' + (tab === t ? '#2563EB' : '#E2E8F0'),
              background: tab === t ? '#2563EB' : 'white',
              color: tab === t ? 'white' : '#374151',
              borderRadius: 8, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t === 'ACTIVE' ? 'Activas' : 'Resueltas'}
          </button>
        ))}
      </div>

      {/* Filtro por tipo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['ALL', ...TIPOS] as (AlertType | 'ALL')[]).map(t => (
          <button
            key={t}
            onClick={() => cambiarTipo(t)}
            style={{
              padding: '5px 11px',
              border: '1px solid ' + (tipo === t ? '#94A3B8' : '#E2E8F0'),
              background: tipo === t ? '#F1F5F9' : 'white',
              color: '#374151', borderRadius: 20, fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t === 'ALL' ? 'Todas' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background:'#FEF2F2', color:'#B91C1C', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:14 }}>
          {error}
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Cargando…</div>
        ) : visibles.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {tab === 'ACTIVE' ? 'Sin alertas activas' : 'Sin alertas resueltas'}
            </div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
              {tab === 'ACTIVE' ? 'Todo la operación está al día.' : 'Todavía no se ha resuelto ninguna alerta.'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', textAlign: 'left', color: '#64748B' }}>
                <th style={{ padding: '10px 14px', fontWeight: 500 }}>Tipo</th>
                <th style={{ padding: '10px 14px', fontWeight: 500 }}>Pedido</th>
                <th style={{ padding: '10px 14px', fontWeight: 500 }}>Tienda</th>
                <th style={{ padding: '10px 14px', fontWeight: 500 }}>Detectada</th>
                <th style={{ padding: '10px 14px', fontWeight: 500 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '11px 14px', verticalAlign: 'top' }}>
                    <span
                      title={TYPE_HELP[a.type]}
                      style={{
                        display: 'inline-block',
                        background: TYPE_STYLE[a.type].bg,
                        color: TYPE_STYLE[a.type].color,
                        padding: '2px 9px', borderRadius: 20,
                        fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                      }}
                    >
                      {TYPE_LABEL[a.type]}
                    </span>
                    <div style={{ color: '#475569', marginTop: 5, maxWidth: 340 }}>{a.title}</div>
                    {a.detail && (
                      <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 2, maxWidth: 340 }}>{a.detail}</div>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px', verticalAlign: 'top' }}>
                    {a.orderId ? (
                      <Link href={`/recepciones/${a.orderId}`} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}>
                        {a.orderNumber ?? 'Ver pedido'}
                      </Link>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px', verticalAlign: 'top', color: '#475569' }}>
                    {a.storeName ?? '—'}
                  </td>
                  <td style={{ padding: '11px 14px', verticalAlign: 'top', color: '#64748B', whiteSpace: 'nowrap' }}>
                    {antiguedad(a.firstSeenAt)}
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>{fechaCorta(a.firstSeenAt)}</div>
                  </td>
                  <td style={{ padding: '11px 14px', verticalAlign: 'top', textAlign: 'right' }}>
                    {a.status === 'ACTIVE' ? (
                      <button
                        onClick={() => { setResolving(a); setNota(''); setError('') }}
                        style={{
                          padding: '6px 12px', background: 'white', color: '#374151',
                          border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12,
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        Resolver
                      </button>
                    ) : (
                      <div style={{ color: '#16A34A', fontSize: 12, whiteSpace: 'nowrap' }}>
                        Resuelta {a.resolvedAt ? fechaCorta(a.resolvedAt) : ''}
                        {a.resolvedNote && (
                          <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 2, maxWidth: 220, whiteSpace: 'normal' }}>
                            “{a.resolvedNote}”
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal resolver */}
      {resolving && (
        <div
          onClick={() => !saving && setResolving(null)}
          style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:50 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:12, padding:24, width:'100%', maxWidth:440 }}>
            <div style={{ fontSize:15, fontWeight:500, marginBottom:4 }}>Resolver alerta</div>
            <div style={{ fontSize:13, color:'#6B7280', marginBottom:16 }}>{resolving.title}</div>
            <label style={{ fontSize:12, color:'#374151', display:'block', marginBottom:6 }}>
              Nota (opcional) — qué se hizo con este pedido
            </label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej: hablé con el operador, lo retiran mañana"
              style={{ width:'100%', padding:'9px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'inherit', resize:'vertical', outline:'none' }}
            />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button
                onClick={() => setResolving(null)}
                disabled={saving}
                style={{ padding:'9px 16px', background:'white', border:'1px solid #CBD5E1', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarResolver}
                disabled={saving}
                style={{ padding:'9px 16px', background:'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}
              >
                {saving ? 'Guardando…' : 'Resolver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
