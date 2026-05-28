'use client'
import { useEffect, useState } from 'react'

interface Summary {
  total:number; previous:number; change:number
  delivered:number; pending:number; inTransit:number
  received:number; incidents:number; successRate:number
  nsHoy: number | null; nsTotal:number; nsDelivered:number
}
interface DayData    { date:string; label:string; total:number; delivered:number }
interface NsDay      { date:string; label:string; inTransit:number; delivered:number; incident:number; ns:number|null }
interface PlatData   { platform:string; count:number; pct:number }
interface StoreData  { storeId:string; storeName:string; count:number }
interface DriverData { driverId:string; driverName:string; delivered:number }
interface ComunaData { comuna:string; region:string; count:number }
interface AvgDelivery{ avgHours:number; count:number }

interface ReportData {
  summary:     Summary
  byDay:       DayData[]
  nsDiario:    NsDay[]
  byPlatform:  PlatData[]
  byStore:     StoreData[]
  byDriver:    DriverData[]
  byComuna:    ComunaData[]
  avgDelivery: AvgDelivery
}

const PLATFORM_LABEL: Record<string,string> = {
  SHOPIFY:'Shopify', WOOCOMMERCE:'WooCommerce', JUMPSELLER:'Jumpseller',
  MERCADOLIBRE:'ML Flex', MANUAL:'Manual',
}
const PLAT_COLOR: Record<string,string> = {
  SHOPIFY:'#6366F1', WOOCOMMERCE:'#8B5CF6', JUMPSELLER:'#F59E0B',
  MERCADOLIBRE:'#10B981', MANUAL:'#6B7280',
}
const PERIOD_LABEL: Record<string,string> = {
  today:'Hoy', week:'Últimos 7 días', month:'Este mes',
  last_month:'Mes anterior', '3months':'Últimos 3 meses',
}

function nsColor(ns: number | null): string {
  if (ns === null) return '#6B7280'
  if (ns >= 95) return '#10B981'
  if (ns >= 85) return '#F59E0B'
  return '#EF4444'
}

function nsLabel(ns: number | null): string {
  if (ns === null) return '—'
  if (ns >= 95) return '✅ Excelente'
  if (ns >= 85) return '⚠️ Regular'
  return '❌ Bajo'
}

export default function ReportesPage() {
  const [data,           setData]           = useState<ReportData | null>(null)
  const [period,         setPeriod]         = useState('month')
  const [loading,        setLoading]        = useState(true)
  const [tab,            setTab]            = useState<'ns'|'overview'|'plataformas'|'conductores'|'comunas'>('ns')
  const [userRole,       setUserRole]       = useState<string>('')
  const [stores,         setStores]         = useState<{id:string;name:string}[]>([])
  const [storeExport,    setStoreExport]    = useState('')
  const [fechaExport,    setFechaExport]    = useState(new Date().toISOString().split('T')[0])
  const [loadingExport2, setLoadingExport2] = useState(false)

  useEffect(() => { load() }, [period])
  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(d => { if (d?.user?.role) setUserRole(d.user.role) })
    fetch('/api/stores/list').then(r => r.json()).then(d => { if (d.ok) setStores(d.data) })
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports?period=${period}`)
      const d   = await res.json()
      if (d.ok) setData(d.data)
    } finally { setLoading(false) }
  }

  async function exportCSV() {
    if (!data) return
    const rows = [
      ['Métrica','Valor'],
      ['Total pedidos', data.summary.total],
      ['Entregados', data.summary.delivered],
      ['NS Hoy', data.summary.nsHoy !== null ? `${data.summary.nsHoy}%` : '—'],
      ['NS del período', `${data.summary.successRate}%`],
      ['En camino', data.summary.inTransit],
      ['Incidencias', data.summary.incidents],
      ['Tiempo promedio entrega', `${data.avgDelivery.avgHours}h`],
      [],
      ['Fecha','En ruta','Entregados','Incidencias','NS%'],
      ...data.nsDiario.map(d => [d.label, d.inTransit, d.delivered, d.incident, d.ns !== null ? `${d.ns}%` : '—']),
    ]
    const csv  = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `reporte_moovex_${period}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function exportTienda() {
    setLoadingExport2(true)
    try {
      const params = new URLSearchParams()
      if (storeExport) params.set('storeId', storeExport)
      params.set('fecha', fechaExport)
      const res  = await fetch(`/api/reports/export-tienda?${params.toString()}`)
      const data = await res.json()
      if (!data.ok || !data.data?.length) { alert('No hay pedidos para exportar'); return }
      const XLSX = await import('xlsx')
      const rows = data.data.map((o: any) => ({
        'ID Moovex':         o.orderNumber,
        'ID WooCommerce':    o.sourceId || '—',
        'Tienda':            o.tienda,
        'Sub-tienda':        o.subTienda || '—',
        'Cliente':           o.cliente,
        'Dirección':         o.direccion,
        'Comuna':            o.comuna,
        'Estado':            o.estado,
        'Motivo no entrega': o.motivoNoEntrega || '—',
        'Entregado en':      o.entregadoEn || '—',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{wch:14},{wch:16},{wch:20},{wch:16},{wch:24},{wch:28},{wch:16},{wch:14},{wch:28},{wch:20}]
      const wb = XLSX.utils.book_new()
      const nombreTienda = stores.find(s => s.id === storeExport)?.name ?? 'todas'
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
      XLSX.writeFile(wb, `reporte_${nombreTienda}_${fechaExport}.xlsx`)
    } catch { alert('Error exportando') }
    finally { setLoadingExport2(false) }
  }

  if (loading && !data) return (
    <div style={{ padding:60, textAlign:'center', color:'var(--text-muted)' }}>
      <div style={{ fontSize:32, marginBottom:10 }}>📊</div>
      <div style={{ color:'var(--text-secondary)' }}>Cargando reportes...</div>
    </div>
  )

  const s = data?.summary

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)', margin:0 }}>Reportes y métricas</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>
            {PERIOD_LABEL[period]} {loading ? '· Actualizando...' : ''}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <select value={period} onChange={e=>setPeriod(e.target.value)}
            style={{ padding:'7px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', fontFamily:'inherit', color:'var(--text-primary)' }}>
            {Object.entries(PERIOD_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={exportCSV} disabled={!data}
            style={{ padding:'7px 14px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-card)', cursor:'pointer', color:'var(--text-secondary)' }}>
            ⬇ CSV
          </button>
        </div>
      </div>

      {/* ── NS + KPIs ── */}
      {s && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 3fr', gap:14, marginBottom:20 }}>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:24, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center', borderLeft:'3px solid var(--accent)' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>NS Hoy</div>
            <div style={{ fontSize:64, fontWeight:800, color: s.nsHoy !== null ? nsColor(s.nsHoy) : 'var(--text-muted)', lineHeight:1, marginBottom:8 }}>
              {s.nsHoy !== null ? `${s.nsHoy}%` : '—'}
            </div>
            <div style={{ fontSize:13, color: s.nsHoy !== null ? nsColor(s.nsHoy) : 'var(--text-muted)', fontWeight:500, marginBottom:12 }}>
              {nsLabel(s.nsHoy)}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.5 }}>
              {s.nsDelivered} entregados<br/>de {s.nsTotal} en ruta hoy
            </div>
            {s.nsHoy !== null && (
              <div style={{ width:'100%', marginTop:14 }}>
                <div style={{ height:6, background:'var(--bg-input)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:`${s.nsHoy}%`, height:'100%', background:nsColor(s.nsHoy), borderRadius:3, transition:'width .6s' }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--text-muted)', marginTop:3 }}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            <KPICard label="En ruta hoy"     value={s.inTransit}   accent="#6366F1" sub="pedidos activos"/>
            <KPICard label="Entregados hoy"  value={s.nsDelivered} accent="#10B981" sub="con evidencia"/>
            <KPICard label="Incidencias"     value={s.incidents}   accent="#EF4444" sub={s.nsTotal>0?`${Math.round(s.incidents/(s.nsTotal||1)*100)}% del total`:'del período'}/>
            <KPICard label="Tiempo promedio" value={data?.avgDelivery.avgHours ? `${data.avgDelivery.avgHours}h` : '—'} accent="#8B5CF6" sub="creación a entrega"/>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display:'flex', gap:0, marginBottom:16, borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
        {([
          { key:'ns',          label:'📊 NS Diario' },
          { key:'overview',    label:'📈 Evolución' },
          { key:'plataformas', label:'🔗 Plataformas' },
          { key:'conductores', label:'🚚 Conductores' },
          { key:'comunas',     label:'📍 Comunas' },
        ] as {key:typeof tab;label:string}[]).map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'10px 18px', fontSize:13, fontWeight:tab===t.key?600:400, background:'none', border:'none', cursor:'pointer', whiteSpace:'nowrap',
              color: tab===t.key ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: `2px solid ${tab===t.key ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab NS ── */}
      {tab === 'ns' && data && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:4 }}>Nivel de Servicio — Últimos 14 días</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:20 }}>% pedidos entregados sobre pedidos que salieron a ruta ese día</div>
            <NSChart data={data.nsDiario}/>
          </div>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>Detalle por día</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg-base)' }}>
                  {['Fecha','En ruta','Entregados','Incidencias','NS%','Estado'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--text-muted)', borderBottom:'1px solid var(--border)', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.nsDiario].reverse().map((d, i) => (
                  <tr key={d.date} style={{ background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>{d.label}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--text-secondary)' }}>{d.inTransit || '—'}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:13, color:'#6EE7B7', fontWeight:500 }}>{d.delivered || '—'}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:13, color: d.incident>0?'#FCA5A5':'var(--text-muted)' }}>{d.incident || '—'}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)' }}>
                      {d.ns !== null ? <span style={{ fontSize:14, fontWeight:700, color:nsColor(d.ns) }}>{d.ns}%</span>
                        : <span style={{ fontSize:12, color:'var(--text-muted)' }}>Sin datos</span>}
                    </td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                      {d.ns !== null ? (
                        <span style={{ padding:'2px 8px', borderRadius:20, fontWeight:500, fontSize:11,
                          background: d.ns>=95?'rgba(16,185,129,0.1)':d.ns>=85?'rgba(245,158,11,0.1)':'rgba(239,68,68,0.1)',
                          color: nsColor(d.ns) }}>
                          {nsLabel(d.ns)}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab Overview ── */}
      {tab === 'overview' && data && (
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:4 }}>Pedidos por día</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:18 }}>Total de pedidos creados en el período</div>
            <BarChart data={data.byDay} maxItems={30}/>
          </div>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:16 }}>Distribución del período</div>
            {s && [
              { label:'Entregados',    value:s.delivered, color:'#10B981' },
              { label:'En camino',     value:s.inTransit, color:'#6366F1' },
              { label:'Recepcionados', value:s.received,  color:'#8B5CF6' },
              { label:'Incidencias',   value:s.incidents, color:'#EF4444' },
            ].map(item => {
              const base = s.delivered + s.inTransit + s.received + s.incidents
              return (
                <div key={item.label} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'var(--text-secondary)' }}>{item.label}</span>
                    <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{item.value}</span>
                  </div>
                  <div style={{ height:5, background:'var(--bg-input)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ width: base>0?`${Math.round(item.value/base*100)}%`:'0%', height:'100%', background:item.color, borderRadius:3, transition:'width .4s' }}/>
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop:16, padding:'12px 14px', background:'var(--bg-base)', borderRadius:8 }}>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:2 }}>NS del período</div>
              <div style={{ fontSize:22, fontWeight:700, color:nsColor(s.successRate) }}>{s.successRate}%</div>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>{s.delivered} entregados de {s.total} totales</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Plataformas ── */}
      {tab === 'plataformas' && data && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:16 }}>Pedidos por plataforma</div>
            {data.byPlatform.map(p => (
              <div key={p.platform} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:8,height:8,borderRadius:'50%',background:PLAT_COLOR[p.platform]||'#6B7280',flexShrink:0,display:'inline-block' }}/>
                    <span style={{ fontSize:13, color:'var(--text-secondary)' }}>{PLATFORM_LABEL[p.platform]||p.platform}</span>
                  </div>
                  <div style={{ display:'flex', gap:10, fontSize:12 }}>
                    <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{p.count}</span>
                    <span style={{ color:'var(--text-muted)' }}>{p.pct}%</span>
                  </div>
                </div>
                <div style={{ height:6, background:'var(--bg-input)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ width:`${p.pct}%`, height:'100%', background:PLAT_COLOR[p.platform]||'#6B7280', borderRadius:4, transition:'width .4s' }}/>
                </div>
              </div>
            ))}
          </div>
          {data.byStore.length > 0 && (
            <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:16 }}>Top tiendas</div>
              {data.byStore.map((s, i) => (
                <div key={s.storeId} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                  <span style={{ width:22,height:22,borderRadius:'50%',background:'var(--bg-input)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,flexShrink:0,color:'var(--text-secondary)' }}>{i+1}</span>
                  <span style={{ flex:1, color:'var(--text-secondary)' }}>{s.storeName}</span>
                  <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Conductores ── */}
      {tab === 'conductores' && data && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>
            Entregas por conductor — {PERIOD_LABEL[period]}
          </div>
          {data.byDriver.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Sin datos para este período</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'var(--bg-base)' }}>
                {['#','Conductor','Entregas','Rendimiento'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--text-muted)', borderBottom:'1px solid var(--border)', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.byDriver.sort((a,b)=>b.delivered-a.delivered).map((d, i) => {
                  const max = data.byDriver[0]?.delivered || 1
                  const pct = Math.round(d.delivered / max * 100)
                  return (
                    <tr key={d.driverId}>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--text-muted)' }}>{i+1}</td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:500 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,#6366F1,#4F46E5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'white' }}>
                            {d.driverName.slice(0,2).toUpperCase()}
                          </div>
                          <span style={{ color:'var(--text-primary)' }}>{d.driverName}</span>
                        </div>
                      </td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:22, fontWeight:600, color:'var(--accent)' }}>{d.delivered}</td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', minWidth:200 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ flex:1, height:6, background:'var(--bg-input)', borderRadius:4, overflow:'hidden' }}>
                            <div style={{ width:`${pct}%`, height:'100%', background:'var(--accent)', borderRadius:4 }}/>
                          </div>
                          <span style={{ fontSize:12, color:'var(--text-muted)', flexShrink:0 }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab Comunas ── */}
      {tab === 'comunas' && data && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>
            Top comunas — {PERIOD_LABEL[period]}
          </div>
          {data.byComuna.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Sin datos para este período</div>
          ) : (
            <div style={{ padding:20 }}>
              {data.byComuna.map((c, i) => {
                const max = data.byComuna[0]?.count || 1
                const pct = Math.round(c.count / max * 100)
                return (
                  <div key={c.comuna} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, color:'var(--text-muted)', minWidth:20 }}>{i+1}.</span>
                        <strong style={{ color:'var(--text-primary)' }}>{c.comuna}</strong>
                        <span style={{ fontSize:11, color:'var(--text-muted)' }}>{c.region}</span>
                      </span>
                      <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{c.count}</span>
                    </div>
                    <div style={{ height:5, background:'var(--bg-input)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:'var(--accent)', borderRadius:3, transition:'width .4s' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Reporte por tienda SUPER_ADMIN ── */}
      {userRole === 'SUPER_ADMIN' && (
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginTop:16 }}>
          <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:4 }}>📥 Reporte por tienda</div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
            Descarga el Excel de pedidos del día por tienda — estados En camino, Entregado y No entregado
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <select value={storeExport} onChange={e => setStoreExport(e.target.value)}
              style={{ padding:'7px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', fontFamily:'inherit', color:'var(--text-primary)', minWidth:200 }}>
              <option value="">Todas las tiendas</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" value={fechaExport} onChange={e => setFechaExport(e.target.value)}
              style={{ padding:'7px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, fontFamily:'inherit', background:'var(--bg-input)', color:'var(--text-primary)' }}/>
            <button onClick={exportTienda} disabled={loadingExport2}
              style={{ padding:'7px 16px', background:loadingExport2?'var(--bg-input)':'rgba(16,185,129,0.15)', color:'#6EE7B7', border:'1px solid rgba(16,185,129,0.3)', borderRadius:8, fontSize:13, fontWeight:500, cursor:loadingExport2?'not-allowed':'pointer' }}>
              {loadingExport2 ? '⏳ Generando...' : '⬇ Descargar Excel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function KPICard({ label, value, accent, sub }: { label:string; value:string|number; accent:string; sub?:string }) {
  return (
    <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px', borderLeft:`3px solid ${accent}` }}>
      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:600, lineHeight:1, color:'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function NSChart({ data }: { data: NsDay[] }) {
  const hasData = data.some(d => d.ns !== null)
  if (!hasData) return (
    <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-muted)', fontSize:13 }}>Sin datos de NS por día todavía</div>
  )
  return (
    <div>
      <div style={{ position:'relative', height:140, marginBottom:8 }}>
        <div style={{ position:'absolute', top:'5%', left:0, right:0, borderTop:'1px dashed #10B981', opacity:.3 }}>
          <span style={{ position:'absolute', right:0, top:-10, fontSize:9, color:'#10B981' }}>95%</span>
        </div>
        <div style={{ position:'absolute', top:'15%', left:0, right:0, borderTop:'1px dashed #F59E0B', opacity:.3 }}>
          <span style={{ position:'absolute', right:0, top:-10, fontSize:9, color:'#F59E0B' }}>85%</span>
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:'100%' }}>
          {data.map((d, i) => {
            const height = d.ns !== null ? `${d.ns}%` : '0%'
            const color  = d.ns !== null ? (d.ns>=95?'#10B981':d.ns>=85?'#F59E0B':'#EF4444') : 'var(--bg-input)'
            return (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', height:'100%', justifyContent:'flex-end' }}
                title={d.ns !== null ? `${d.label}: NS ${d.ns}% (${d.delivered}/${d.inTransit})` : `${d.label}: Sin datos`}>
                <div style={{ width:'100%', background:color, borderRadius:'3px 3px 0 0', minHeight:d.ns!==null?2:0, height, transition:'height .4s', opacity:d.ns!==null?.9:.3 }}/>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display:'flex', gap:4 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:'center', fontSize:9, color:'var(--text-muted)', overflow:'hidden' }}>
            {i % 2 === 0 ? d.label : ''}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:16, marginTop:10, fontSize:11 }}>
        <span style={{ display:'flex', alignItems:'center', gap:4, color:'#10B981' }}><span style={{ width:10,height:10,borderRadius:2,background:'#10B981',display:'inline-block' }}/> ≥95%</span>
        <span style={{ display:'flex', alignItems:'center', gap:4, color:'#F59E0B' }}><span style={{ width:10,height:10,borderRadius:2,background:'#F59E0B',display:'inline-block' }}/> 85-94%</span>
        <span style={{ display:'flex', alignItems:'center', gap:4, color:'#EF4444' }}><span style={{ width:10,height:10,borderRadius:2,background:'#EF4444',display:'inline-block' }}/> &lt;85%</span>
      </div>
    </div>
  )
}

function BarChart({ data, maxItems = 30 }: { data: DayData[]; maxItems?: number }) {
  const visible = data.slice(-maxItems)
  const max     = Math.max(...visible.map(d => d.total), 1)
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:120, marginBottom:6 }}>
        {visible.map((d, i) => (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', height:'100%', justifyContent:'flex-end' }}
            title={`${d.label}: ${d.total} pedidos`}>
            <div style={{ width:'100%', background:'var(--accent)', borderRadius:'2px 2px 0 0', opacity:.8, minHeight:d.total>0?2:0,
              height:`${Math.round(d.total/max*100)}%`, transition:'height .3s' }}/>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:3 }}>
        {visible.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:'center', fontSize:9, color:'var(--text-muted)', overflow:'hidden' }}>
            {i % Math.max(1, Math.floor(visible.length / 6)) === 0 ? d.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
