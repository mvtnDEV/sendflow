'use client'
import { useState } from 'react'
import Link from 'next/link'

const STATUS_COLOR: Record<string, { bg: string; color: string; dot: string }> = {
  PENDING:    { bg:'rgba(245,158,11,0.1)',  color:'#FCD34D', dot:'#F59E0B' },
  RECEIVED:   { bg:'rgba(59,130,246,0.1)',  color:'#93C5FD', dot:'#3B82F6' },
  IN_TRANSIT: { bg:'rgba(99,102,241,0.1)',  color:'#A5B4FC', dot:'#6366F1' },
  DELIVERED:  { bg:'rgba(16,185,129,0.1)',  color:'#6EE7B7', dot:'#10B981' },
  INCIDENT:   { bg:'rgba(239,68,68,0.1)',   color:'#FCA5A5', dot:'#EF4444' },
}
const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pendiente',
  RECEIVED:   'Recepcionado',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'No entregado',
}
const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:      'Shopify',
  MERCADOLIBRE: 'ML Flex',
  WOOCOMMERCE:  'WooCommerce',
  JUMPSELLER:   'Jumpseller',
  MANUAL:       'Manual',
}
const PLATFORM_PREFIX: Record<string, string> = {
  SHOPIFY:'SHF', MERCADOLIBRE:'ML', WOOCOMMERCE:'WOO', JUMPSELLER:'JMP', MANUAL:'MAN',
}

function formatSourceId(sourceId: string | null, platform: string): string | null {
  if (!sourceId) return null
  const prefix = PLATFORM_PREFIX[platform]
  if (!prefix || platform === 'MANUAL') return null
  return `${prefix}-${sourceId}`
}

function formatRawStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function getPlatformStatus(rawPayload: any): string | null {
  if (!rawPayload) return null
  const status = rawPayload.status ?? rawPayload.financial_status ?? null
  if (!status) return null
  return formatRawStatus(String(status))
}

const TZ = 'America/Santiago'
function fmtTime(date: Date | string) {
  return new Date(date).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone: TZ })
}
function fmtDate(date: Date | string) {
  return new Date(date).toLocaleDateString('es-CL', { day:'2-digit', month:'short', timeZone: TZ })
}

const btn: React.CSSProperties = {
  padding:'7px 14px', border:'none', borderRadius:8,
  fontSize:13, fontWeight:500, cursor:'pointer', transition:'opacity 0.15s',
}

export default function RecepcionesClient({
  storeName, todayOnly, orders = [], total, page, totalPages, userRole, searchParams,
}: {
  storeName:    string
  todayOnly:    boolean
  orders?:      any[]
  total:        number
  page:         number
  totalPages:   number
  userRole:     string
  searchParams: Record<string, string | undefined>
}) {
  const [loadingExport,      setLoadingExport]      = useState(false)
  const [loadingRecepcionar, setLoadingRecepcionar] = useState(false)
  const [loadingEtiquetas,   setLoadingEtiquetas]   = useState(false)
  const [resultado,          setResultado]          = useState<{ ok: boolean; msg: string } | null>(null)
  const [selected,           setSelected]           = useState<Set<string>>(new Set())

  const isStoreAdmin = userRole === 'STORE_ADMIN'
  const pendientes   = orders.filter(o => o.status === 'PENDING')
  const allSelected  = selected.size === orders.length && orders.length > 0

  function buildPageUrl(p: number) {
    const params = new URLSearchParams()
    Object.entries(searchParams).forEach(([k, v]) => { if (v) params.set(k, v) })
    params.set('page', String(p))
    return `/recepciones?${params.toString()}`
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(orders.map((o: any) => o.id)))
  }

  async function exportExcel() {
    setLoadingExport(true)
    try {
      const params = new URLSearchParams(window.location.search)
      if (todayOnly) params.set('todayOnly', '1')
      const res  = await fetch(`/api/orders/export?${params.toString()}`)
      const data = await res.json()
      if (!data.ok || !data.data?.length) { alert('No hay pedidos para exportar'); return }
      const XLSX = await import('xlsx')
      const rows = data.data.map((o: any) => ({
        'N° Pedido':  o.orderNumber,
        'ID Origen':  formatSourceId(o.sourceId, o.platform) ?? '—',
        'Sub-tienda': o.subStoreName || '—',
        'Tienda':     o.store?.name || '',
        'Cliente':    o.customerName,
        'Teléfono':   o.customerPhone || '',
        'Dirección':  o.addressStreet,
        'Comuna':     o.addressComuna,
        'Plataforma': PLATFORM_LABEL[o.platform] ?? o.platform,
        'Bultos':     o.bultos,
        'Estado':     STATUS_LABEL[o.status] ?? o.status,
        'Creado':     new Date(o.createdAt).toLocaleString('es-CL'),
        'Entregado':  o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('es-CL') : '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{wch:12},{wch:14},{wch:16},{wch:20},{wch:22},{wch:14},{wch:28},{wch:16},{wch:14},{wch:8},{wch:14},{wch:18},{wch:18}]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
      const fecha = new Date().toLocaleDateString('es-CL').replace(/\//g, '-')
      XLSX.writeFile(wb, `moovex_${storeName}_${todayOnly?'hoy':'historial'}_${fecha}.xlsx`)
    } catch { alert('Error exportando.') }
    finally { setLoadingExport(false) }
  }

  async function recepcionarTodos() {
    if (pendientes.length === 0) return
    if (!confirm(`¿Recepcionar ${pendientes.length} pedido${pendientes.length!==1?'s':''}?`)) return
    setLoadingRecepcionar(true)
    setResultado(null)
    try {
      const res  = await fetch('/api/orders/batch-receive', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ orderIds: pendientes.map(o => o.id) }),
      })
      const data = await res.json()
      if (data.ok) {
        setResultado({ ok:true, msg:`✅ ${data.updated} pedido${data.updated!==1?'s':''} recepcionado${data.updated!==1?'s':''}` })
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setResultado({ ok:false, msg:`❌ Error: ${data.error}` })
      }
    } catch { setResultado({ ok:false, msg:'❌ Error al recepcionar' }) }
    finally { setLoadingRecepcionar(false) }
  }

  async function imprimirEtiquetas() {
    const ids = selected.size > 0 ? Array.from(selected) : orders.map((o: any) => o.id)
    if (ids.length === 0) { alert('No hay pedidos'); return }
    setLoadingEtiquetas(true)
    try {
      const res = await fetch('/api/labels/bulk', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ orderIds: ids }),
      })
      if (!res.ok) { alert('Error generando etiquetas'); return }
      const html = await res.text()
      const win  = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
    } catch { alert('Error generando etiquetas') }
    finally { setLoadingEtiquetas(false) }
  }

  return (
    <div>
      <style>{`
        @keyframes pulse-dot {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.5; transform:scale(1.5); }
        }
        .pulse-dot {
          display:inline-block; width:6px; height:6px;
          border-radius:50%; animation:pulse-dot 1.5s infinite;
        }
        @media (max-width:768px) {
          .col-hide-mobile { display:none !important; }
          .mobile-card     { display:flex !important; }
          .desktop-table   { display:none !important; }
        }
        @media (min-width:769px) {
          .mobile-card   { display:none !important; }
          .desktop-table { display:block !important; }
        }
        .sticky-arrow        { position:sticky; right:0; z-index:2; }
        .sticky-arrow-header { position:sticky; right:0; z-index:3; background:var(--bg-base); }
        tbody tr:hover .sticky-arrow { background:var(--bg-card-hover) !important; }
        tbody tr { transition:background 0.1s; }
        tbody tr:hover { background:var(--bg-card-hover) !important; }
      `}</style>

      {/* ── Barra de acciones ── */}
      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
        {pendientes.length > 0 && (
          <button onClick={recepcionarTodos} disabled={loadingRecepcionar}
            style={{ ...btn, background:'rgba(245,158,11,0.15)', color:'#FCD34D', border:'1px solid rgba(245,158,11,0.3)' }}>
            {loadingRecepcionar ? '⏳ Recepcionando...' : `📥 Recepcionar (${pendientes.length})`}
          </button>
        )}
        {orders.length > 0 && (
          <button onClick={imprimirEtiquetas} disabled={loadingEtiquetas}
            style={{ ...btn, background:'rgba(139,92,246,0.15)', color:'#C4B5FD', border:'1px solid rgba(139,92,246,0.3)' }}>
            {loadingEtiquetas ? '⏳ Generando...' : selected.size > 0 ? `🖨 Etiquetas (${selected.size})` : `🖨 Etiquetas (${orders.length})`}
          </button>
        )}
        <button onClick={exportExcel} disabled={loadingExport}
          style={{ ...btn, background:'rgba(16,185,129,0.15)', color:'#6EE7B7', border:'1px solid rgba(16,185,129,0.3)' }}>
          {loadingExport ? '⏳...' : '⬇ Excel'}
        </button>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())}
            style={{ ...btn, background:'var(--bg-input)', color:'var(--text-muted)', border:'1px solid var(--border)' }}>
            × Limpiar ({selected.size})
          </button>
        )}
      </div>

      {/* ── Resultado ── */}
      {resultado && (
        <div style={{
          fontSize:12, padding:'8px 14px', borderRadius:8, marginBottom:10, fontWeight:500,
          background: resultado.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color:      resultado.ok ? '#6EE7B7' : '#FCA5A5',
          border:     `1px solid ${resultado.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {resultado.msg}
        </div>
      )}

      {orders.length === 0 ? (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:48, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>{todayOnly ? '📅' : '📦'}</div>
          <div style={{ fontSize:15, fontWeight:500, color:'var(--text-primary)', marginBottom:6 }}>
            {todayOnly ? 'Sin pedidos hoy todavía' : 'No hay resultados'}
          </div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
            {todayOnly ? 'Los pedidos que lleguen hoy aparecerán aquí automáticamente' : 'Prueba cambiando los filtros'}
          </div>
          {todayOnly && (
            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              <Link href="/pedidos/nuevo" style={{ padding:'8px 18px', background:'var(--accent)', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
                + Crear pedido manual
              </Link>
              <Link href="/recepciones?historial=1" style={{ padding:'8px 18px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, color:'var(--text-secondary)', textDecoration:'none' }}>
                Ver historial
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── TABLA DESKTOP ── */}
          <div className="desktop-table" style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
              <thead>
                <tr style={{ background:'var(--bg-base)' }}>
                  <th style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', width:36 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor:'pointer', width:15, height:15, accentColor:'var(--accent)' }}/>
                  </th>
                  {['N° Pedido','Sub-tienda','Tienda','Cliente','Teléfono','Dirección','Plataforma',
                    !isStoreAdmin ? 'Bultos' : 'Estado WOO','Estado','Hora',''].map((h, i) => (
                    <th key={i} className={i >= 4 && i <= 6 ? 'col-hide-mobile' : i === 7 ? 'col-hide-mobile' : i === 9 ? 'col-hide-mobile' : ''}
                      style={{ padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--text-muted)', borderBottom:'1px solid var(--border)', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const sc          = STATUS_COLOR[order.status] ?? STATUS_COLOR.PENDING
                  const isSelected  = selected.has(order.id)
                  const sourceLabel = formatSourceId(order.sourceId, order.platform)
                  const platStatus  = getPlatformStatus(order.rawPayload)
                  const isInTransit = order.status === 'IN_TRANSIT'
                  return (
                    <tr key={order.id} style={{ background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent' }}>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', textAlign:'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(order.id)} style={{ cursor:'pointer', width:15, height:15, accentColor:'var(--accent)' }}/>
                      </td>

                      <td style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:500 }}>
                        {isStoreAdmin && sourceLabel ? (
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:'#6EE7B7' }}>{sourceLabel}</div>
                            <Link href={`/recepciones/${order.id}`} style={{ color:'var(--text-muted)', textDecoration:'none', fontSize:11 }}>{order.orderNumber}</Link>
                          </div>
                        ) : (
                          <Link href={`/recepciones/${order.id}`} style={{ color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>{order.orderNumber}</Link>
                        )}
                      </td>

                      <td style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)' }}>
                        {order.subStoreName ? (
                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(245,158,11,0.1)', color:'#FCD34D', fontWeight:500, whiteSpace:'nowrap', border:'1px solid rgba(245,158,11,0.2)' }}>{order.subStoreName}</span>
                        ) : <span style={{ fontSize:11, color:'var(--text-muted)' }}>—</span>}
                      </td>

                      <td style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'var(--bg-input)', color:'var(--text-secondary)', fontWeight:500, whiteSpace:'nowrap' }}>{order.store?.name ?? '—'}</span>
                      </td>

                      <td style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--text-primary)' }}>{order.customerName}</td>
                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>{order.customerPhone || '—'}</td>
                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {order.addressStreet}, {order.addressComuna}
                      </td>
                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>{PLATFORM_LABEL[order.platform] ?? order.platform}</td>

                      {!isStoreAdmin ? (
                        <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', fontSize:13, textAlign:'center', color:'var(--text-secondary)' }}>{order.bultos}</td>
                      ) : (
                        <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>
                          {platStatus ? (
                            <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(99,102,241,0.1)', color:'#A5B4FC', fontWeight:500 }}>{platStatus}</span>
                          ) : <span style={{ fontSize:11, color:'var(--text-muted)' }}>—</span>}
                        </td>
                      )}

                      <td style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:500, background:sc.bg, color:sc.color }}>
                          {isInTransit ? (
                            <span className="pulse-dot" style={{ background:sc.dot }}/>
                          ) : (
                            <span style={{ width:5, height:5, borderRadius:'50%', background:sc.dot, display:'inline-block' }}/>
                          )}
                          {STATUS_LABEL[order.status]}
                        </span>
                        {order.evidencePhoto1 && <span style={{ marginLeft:4, fontSize:11 }}>📷</span>}
                      </td>

                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                        {fmtTime(order.createdAt)}
                        {!todayOnly && <div style={{ fontSize:11 }}>{fmtDate(order.createdAt)}</div>}
                      </td>

                      <td className="sticky-arrow" style={{ padding:'11px 12px', borderBottom:'1px solid var(--border)', background: isSelected ? 'rgba(99,102,241,0.08)' : 'var(--bg-card)', boxShadow:'-4px 0 12px rgba(0,0,0,0.2)' }}>
                        <Link href={`/recepciones/${order.id}`} style={{ color:'var(--accent)', fontSize:16, textDecoration:'none', fontWeight:700, padding:'4px 8px', background:'rgba(99,102,241,0.15)', borderRadius:6, display:'inline-block' }}>→</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── CARDS MOBILE ── */}
          <div className="mobile-card" style={{ flexDirection:'column', gap:8 }}>
            {orders.map(order => {
              const sc          = STATUS_COLOR[order.status] ?? STATUS_COLOR.PENDING
              const isSelected  = selected.has(order.id)
              const sourceLabel = formatSourceId(order.sourceId, order.platform)
              const platStatus  = getPlatformStatus(order.rawPayload)
              const isInTransit = order.status === 'IN_TRANSIT'
              return (
                <div key={order.id} style={{ background: isSelected ? 'rgba(99,102,241,0.08)' : 'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:14 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(order.id)} style={{ cursor:'pointer', width:15, height:15, accentColor:'var(--accent)', flexShrink:0 }}/>
                      <div>
                        {isStoreAdmin && sourceLabel ? (
                          <>
                            <div style={{ fontSize:14, fontWeight:700, color:'#6EE7B7' }}>{sourceLabel}</div>
                            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{order.orderNumber}</div>
                          </>
                        ) : (
                          <div style={{ fontSize:14, fontWeight:600, color:'var(--accent)' }}>{order.orderNumber}</div>
                        )}
                        {order.subStoreName && (
                          <span style={{ fontSize:10, padding:'1px 6px', borderRadius:10, background:'rgba(245,158,11,0.1)', color:'#FCD34D', fontWeight:500, border:'1px solid rgba(245,158,11,0.2)' }}>{order.subStoreName}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:sc.bg, color:sc.color }}>
                        {isInTransit ? <span className="pulse-dot" style={{ background:sc.dot }}/> : <span style={{ width:5, height:5, borderRadius:'50%', background:sc.dot, display:'inline-block' }}/>}
                        {STATUS_LABEL[order.status]}
                      </span>
                      <Link href={`/recepciones/${order.id}`} style={{ color:'white', fontSize:14, textDecoration:'none', fontWeight:700, padding:'4px 10px', background:'var(--accent)', borderRadius:6 }}>→</Link>
                    </div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:3 }}>{order.customerName}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:3 }}>{order.customerPhone || '—'}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:6 }}>{order.addressStreet}, {order.addressComuna}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'var(--bg-input)', color:'var(--text-secondary)', fontWeight:500 }}>{order.store?.name ?? '—'}</span>
                    <span style={{ fontSize:10, color:'var(--text-muted)' }}>{PLATFORM_LABEL[order.platform] ?? order.platform}</span>
                    <span style={{ fontSize:10, color:'var(--text-muted)' }}>{fmtTime(order.createdAt)}</span>
                    {isStoreAdmin && platStatus && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(99,102,241,0.1)', color:'#A5B4FC', fontWeight:500 }}>{platStatus}</span>}
                    {order.evidencePhoto1 && <span style={{ fontSize:11 }}>📷</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Paginación ── */}
          <div style={{ padding:'12px 0', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:'var(--text-muted)' }}>
            <span>
              Mostrando <strong style={{ color:'var(--text-secondary)' }}>{orders.length}</strong> de <strong style={{ color:'var(--text-secondary)' }}>{total}</strong> pedido{total!==1?'s':''}
              {todayOnly && <span style={{ marginLeft:8 }}>· Solo hoy</span>}
              {selected.size > 0 && <span style={{ marginLeft:8, color:'var(--accent)', fontWeight:500 }}>· {selected.size} seleccionados</span>}
            </span>
            {totalPages > 1 && (
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span>Pág. {page}/{totalPages}</span>
                {page > 1 && <Link href={buildPageUrl(page-1)} style={{ padding:'4px 10px', border:'1px solid var(--border)', borderRadius:6, textDecoration:'none', color:'var(--text-secondary)', background:'var(--bg-card)' }}>←</Link>}
                {page < totalPages && <Link href={buildPageUrl(page+1)} style={{ padding:'4px 10px', border:'1px solid var(--border)', borderRadius:6, textDecoration:'none', color:'var(--text-secondary)', background:'var(--bg-card)' }}>→</Link>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
