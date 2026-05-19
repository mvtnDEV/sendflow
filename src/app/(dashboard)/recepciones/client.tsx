'use client'
import { useState } from 'react'
import Link from 'next/link'

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  PENDING:    { bg: '#FFFBEB', color: '#92400E' },
  RECEIVED:   { bg: '#EFF6FF', color: '#1D4ED8' },
  IN_TRANSIT: { bg: '#F5F3FF', color: '#5B21B6' },
  DELIVERED:  { bg: '#F0FDF4', color: '#166534' },
  INCIDENT:   { bg: '#FFF1F2', color: '#9F1239' },
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
  SHOPIFY:      'SHF',
  MERCADOLIBRE: 'ML',
  WOOCOMMERCE:  'WOO',
  JUMPSELLER:   'JMP',
  MANUAL:       'MAN',
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
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
        'N° Pedido':   o.orderNumber,
        'ID Origen':   formatSourceId(o.sourceId, o.platform) ?? '—',
        'Sub-tienda':  o.subStoreName || '—',
        'Tienda':      o.store?.name || '',
        'Cliente':     o.customerName,
        'Teléfono':    o.customerPhone || '',
        'Email':       o.customerEmail || '',
        'Dirección':   o.addressStreet,
        'Comuna':      o.addressComuna,
        'Región':      o.addressRegion,
        'Plataforma':  PLATFORM_LABEL[o.platform] ?? o.platform,
        'Bultos':      o.bultos,
        'Estado':      STATUS_LABEL[o.status] ?? o.status,
        'Creado':      new Date(o.createdAt).toLocaleString('es-CL'),
        'Entregado':   o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('es-CL') : '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{wch:12},{wch:14},{wch:16},{wch:20},{wch:22},{wch:14},{wch:24},{wch:28},{wch:16},{wch:16},{wch:14},{wch:8},{wch:14},{wch:18},{wch:18}]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
      const fecha   = new Date().toLocaleDateString('es-CL').replace(/\//g, '-')
      const periodo = todayOnly ? 'hoy' : 'historial'
      XLSX.writeFile(wb, `sendflow_${storeName}_${periodo}_${fecha}.xlsx`)
    } catch { alert('Error exportando.') }
    finally { setLoadingExport(false) }
  }

  async function recepcionarTodos() {
    if (pendientes.length === 0) return
    if (!confirm(`¿Recepcionar ${pendientes.length} pedido${pendientes.length !== 1 ? 's' : ''} pendiente${pendientes.length !== 1 ? 's' : ''}?\n\nEsto los enviará automáticamente a Envios Now.`)) return
    setLoadingRecepcionar(true)
    setResultado(null)
    try {
      const res = await fetch('/api/orders/batch-receive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: pendientes.map(o => o.id) }),
      })
      const data = await res.json()
      if (data.ok) {
        setResultado({ ok: true, msg: `✅ ${data.updated} pedido${data.updated !== 1 ? 's' : ''} recepcionado${data.updated !== 1 ? 's' : ''} correctamente` })
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setResultado({ ok: false, msg: `❌ Error: ${data.error}` })
      }
    } catch { setResultado({ ok: false, msg: '❌ Error al recepcionar' }) }
    finally { setLoadingRecepcionar(false) }
  }

  async function imprimirEtiquetas() {
    const ids = selected.size > 0 ? Array.from(selected) : orders.map((o: any) => o.id)
    if (ids.length === 0) { alert('No hay pedidos'); return }
    setLoadingEtiquetas(true)
    try {
      const res = await fetch('/api/labels/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      {/* Estilos responsive */}
      <style>{`
        @media (max-width: 768px) {
          .col-hide-mobile { display: none !important; }
          .mobile-card { display: flex !important; }
          .desktop-table { display: none !important; }
        }
        @media (min-width: 769px) {
          .mobile-card { display: none !important; }
          .desktop-table { display: block !important; }
        }
      `}</style>

      {/* Barra de acciones */}
      <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
        {pendientes.length > 0 && (
          <button onClick={recepcionarTodos} disabled={loadingRecepcionar}
            style={{ padding:'7px 14px', background:loadingRecepcionar?'#93C5FD':'#D97706', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loadingRecepcionar?'not-allowed':'pointer' }}>
            {loadingRecepcionar ? '⏳ Recepcionando...' : `📥 Recepcionar (${pendientes.length})`}
          </button>
        )}
        {orders.length > 0 && (
          <button onClick={imprimirEtiquetas} disabled={loadingEtiquetas}
            style={{ padding:'7px 14px', background:loadingEtiquetas?'#93C5FD':'#7C3AED', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loadingEtiquetas?'not-allowed':'pointer' }}>
            {loadingEtiquetas ? '⏳ Generando...' : selected.size > 0 ? `🖨 (${selected.size})` : `🖨 Imprimir (${orders.length})`}
          </button>
        )}
        <button onClick={exportExcel} disabled={loadingExport}
          style={{ padding:'7px 14px', background:loadingExport?'#86EFAC':'#16A34A', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loadingExport?'not-allowed':'pointer' }}>
          {loadingExport ? '⏳...' : '⬇ Excel'}
        </button>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())}
            style={{ padding:'7px 12px', background:'white', color:'#6B7280', border:'1px solid #E2E8F0', borderRadius:8, fontSize:12, cursor:'pointer' }}>
            × Limpiar ({selected.size})
          </button>
        )}
      </div>

      {resultado && (
        <div style={{ fontSize:12, padding:'6px 12px', borderRadius:8, marginBottom:8, background:resultado.ok?'#F0FDF4':'#FFF1F2', color:resultado.ok?'#166534':'#9F1239', border:`1px solid ${resultado.ok?'#BBF7D0':'#FECDD3'}`, fontWeight:500 }}>
          {resultado.msg}
        </div>
      )}

      {orders.length === 0 ? (
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:48, textAlign:'center', color:'#9CA3AF' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>{todayOnly ? '📅' : '📦'}</div>
          <div style={{ fontSize:15, fontWeight:500, color:'#374151', marginBottom:6 }}>
            {todayOnly ? 'Sin pedidos hoy todavía' : 'No hay resultados'}
          </div>
          <div style={{ fontSize:13, marginBottom:20 }}>
            {todayOnly ? 'Los pedidos que lleguen hoy aparecerán aquí automáticamente' : 'Prueba cambiando los filtros'}
          </div>
          {todayOnly && (
            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              <Link href="/pedidos/nuevo" style={{ padding:'8px 18px', background:'#2563EB', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
                + Crear pedido manual
              </Link>
              <Link href="/recepciones?historial=1" style={{ padding:'8px 18px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, color:'#374151', textDecoration:'none', background:'white' }}>
                Ver historial
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* TABLA DESKTOP */}
          <div className="desktop-table" style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
              <thead>
                <tr style={{ background:'#F8FAFC' }}>
                  <th style={{ padding:'10px 12px', borderBottom:'1px solid #E2E8F0', width:36 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor:'pointer', width:15, height:15 }}/>
                  </th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>N° pedido</th>
                  {isStoreAdmin && <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>ID Origen</th>}
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>Sub-tienda</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>Tienda</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>Cliente</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }} className="col-hide-mobile">Teléfono</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }} className="col-hide-mobile">Dirección</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }} className="col-hide-mobile">Plataforma</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }} className="col-hide-mobile">Bultos</th>
                  {isStoreAdmin && <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }} className="col-hide-mobile">Estado WOO</th>}
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>Estado</th>
                  <th style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }} className="col-hide-mobile">Hora</th>
                  <th style={{ padding:'10px 12px', borderBottom:'1px solid #E2E8F0' }}></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const sc             = STATUS_COLOR[order.status] ?? STATUS_COLOR.PENDING
                  const isSelected     = selected.has(order.id)
                  const sourceLabel    = formatSourceId(order.sourceId, order.platform)
                  const platformStatus = getPlatformStatus(order.rawPayload)
                  return (
                    <tr key={order.id} style={{ background: isSelected ? '#F0F7FF' : 'white' }}>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', textAlign:'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(order.id)} style={{ cursor:'pointer', width:15, height:15 }}/>
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>
                        {isStoreAdmin && sourceLabel ? (
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:'#166534' }}>{sourceLabel}</div>
                            <Link href={`/recepciones/${order.id}`} style={{ color:'#9CA3AF', textDecoration:'none', fontSize:11 }}>{order.orderNumber}</Link>
                          </div>
                        ) : (
                          <Link href={`/recepciones/${order.id}`} style={{ color:'#1D4ED8', textDecoration:'none' }}>{order.orderNumber}</Link>
                        )}
                      </td>
                      {isStoreAdmin && (
                        <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9' }}>
                          {sourceLabel ? (
                            <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'#F0FDF4', color:'#166534', fontWeight:500, fontFamily:'monospace', whiteSpace:'nowrap' }}>{sourceLabel}</span>
                          ) : (
                            <span style={{ fontSize:11, color:'#D1D5DB' }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9' }}>
                        {order.subStoreName ? (
                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#FFF7ED', color:'#C2410C', fontWeight:500, whiteSpace:'nowrap', border:'1px solid #FED7AA' }}>{order.subStoreName}</span>
                        ) : (
                          <span style={{ fontSize:11, color:'#D1D5DB' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12 }}>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#F1F5F9', color:'#374151', fontWeight:500, whiteSpace:'nowrap' }}>{order.store?.name ?? '—'}</span>
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>{order.customerName}</td>
                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{order.customerPhone || '—'}</td>
                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {order.addressStreet}, {order.addressComuna}
                      </td>
                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{PLATFORM_LABEL[order.platform] ?? order.platform}</td>
                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13, textAlign:'center' }}>{order.bultos}</td>
                      {isStoreAdmin && (
                        <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', whiteSpace:'nowrap' }}>
                          {platformStatus ? (
                            <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#EFF6FF', color:'#1D4ED8', fontWeight:500 }}>{platformStatus}</span>
                          ) : (
                            <span style={{ fontSize:11, color:'#D1D5DB' }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', whiteSpace:'nowrap' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:sc.bg, color:sc.color }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:sc.color }}/>
                          {STATUS_LABEL[order.status]}
                        </span>
                        {order.evidencePhoto1 && <span style={{ marginLeft:4, fontSize:11 }}>📷</span>}
                      </td>
                      <td className="col-hide-mobile" style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#9CA3AF', whiteSpace:'nowrap' }}>
                        {fmtTime(order.createdAt)}
                        {!todayOnly && <div style={{ fontSize:11 }}>{fmtDate(order.createdAt)}</div>}
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9' }}>
                        <Link href={`/recepciones/${order.id}`} style={{ color:'#2563EB', fontSize:18, textDecoration:'none', fontWeight:700, padding:'4px 8px', background:'#EFF6FF', borderRadius:6, display:'inline-block' }}>→</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* CARDS MOBILE */}
          <div className="mobile-card" style={{ flexDirection:'column', gap:8 }}>
            {orders.map(order => {
              const sc          = STATUS_COLOR[order.status] ?? STATUS_COLOR.PENDING
              const isSelected  = selected.has(order.id)
              const sourceLabel = formatSourceId(order.sourceId, order.platform)
              const platformStatus = getPlatformStatus(order.rawPayload)
              return (
                <div key={order.id} style={{ background: isSelected ? '#F0F7FF' : 'white', border:'1px solid #E2E8F0', borderRadius:12, padding:14, position:'relative' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(order.id)} style={{ cursor:'pointer', width:15, height:15, flexShrink:0 }}/>
                      <div>
                        {isStoreAdmin && sourceLabel ? (
                          <>
                            <div style={{ fontSize:14, fontWeight:700, color:'#166534' }}>{sourceLabel}</div>
                            <div style={{ fontSize:11, color:'#9CA3AF' }}>{order.orderNumber}</div>
                          </>
                        ) : (
                          <div style={{ fontSize:14, fontWeight:600, color:'#0B1628' }}>{order.orderNumber}</div>
                        )}
                        {order.subStoreName && (
                          <span style={{ fontSize:10, padding:'1px 6px', borderRadius:10, background:'#FFF7ED', color:'#C2410C', fontWeight:500, border:'1px solid #FED7AA' }}>{order.subStoreName}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:sc.bg, color:sc.color }}>
                        <span style={{ width:5, height:5, borderRadius:'50%', background:sc.color }}/>
                        {STATUS_LABEL[order.status]}
                      </span>
                      <Link href={`/recepciones/${order.id}`} style={{ color:'white', fontSize:14, textDecoration:'none', fontWeight:700, padding:'4px 10px', background:'#2563EB', borderRadius:6, display:'inline-block' }}>→</Link>
                    </div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:500, marginBottom:3 }}>{order.customerName}</div>
                  <div style={{ fontSize:12, color:'#6B7280', marginBottom:3 }}>{order.customerPhone || '—'}</div>
                  <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>{order.addressStreet}, {order.addressComuna}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'#F1F5F9', color:'#374151', fontWeight:500 }}>{order.store?.name ?? '—'}</span>
                    <span style={{ fontSize:10, color:'#9CA3AF' }}>{PLATFORM_LABEL[order.platform] ?? order.platform}</span>
                    <span style={{ fontSize:10, color:'#9CA3AF' }}>{fmtTime(order.createdAt)}</span>
                    {isStoreAdmin && platformStatus && (
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'#EFF6FF', color:'#1D4ED8', fontWeight:500 }}>{platformStatus}</span>
                    )}
                    {order.evidencePhoto1 && <span style={{ fontSize:11 }}>📷</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Paginación */}
          <div style={{ padding:'12px 0', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:'#6B7280' }}>
            <span>
              Mostrando <strong>{orders.length}</strong> de <strong>{total}</strong> pedido{total!==1?'s':''}
              {todayOnly && <span style={{ marginLeft:8, color:'#9CA3AF' }}>· Solo hoy</span>}
              {selected.size > 0 && <span style={{ marginLeft:8, color:'#7C3AED', fontWeight:500 }}>· {selected.size} seleccionados</span>}
            </span>
            {totalPages > 1 && (
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span>Pág. {page}/{totalPages}</span>
                {page > 1 && <Link href={buildPageUrl(page - 1)} style={{ padding:'4px 10px', border:'1px solid #E2E8F0', borderRadius:6, textDecoration:'none', color:'#374151' }}>←</Link>}
                {page < totalPages && <Link href={buildPageUrl(page + 1)} style={{ padding:'4px 10px', border:'1px solid #E2E8F0', borderRadius:6, textDecoration:'none', color:'#374151' }}>→</Link>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
