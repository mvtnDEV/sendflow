'use client'
import { useEffect, useState } from 'react'

interface Summary {
  total:number; previous:number; change:number
  delivered:number; pending:number; inTransit:number
  received:number; incidents:number; successRate:number
  nsHoy: number | null; nsTotal:number; nsDelivered:number
}
interface DayData   { date:string; label:string; total:number; delivered:number }
interface NsDay     { date:string; label:string; inTransit:number; delivered:number; incident:number; ns:number|null }
interface PlatData  { platform:string; count:number; pct:number }
interface StoreData { storeId:string; storeName:string; count:number }
interface DriverData{ driverId:string; driverName:string; delivered:number }
interface ComunaData{ comuna:string; region:string; count:number }
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
  SHOPIFY:'#2563EB', WOOCOMMERCE:'#7C3AED', JUMPSELLER:'#D97706',
  MERCADOLIBRE:'#059669', MANUAL:'#6B7280',
}
const PERIOD_LABEL: Record<string,string> = {
  today:'Hoy', week:'Últimos 7 días', month:'Este mes',
  last_month:'Mes anterior', '3months':'Últimos 3 meses',
}

function nsColor(ns: number | null): string {
  if (ns === null) return '#9CA3AF'
  if (ns >= 95) return '#16A34A'
  if (ns >= 85) return '#D97706'
  return '#DC2626'
}

function nsLabel(ns: number | null): string {
  if (ns === null) return '—'
  if (ns >= 95) return '✅ Excelente'
  if (ns >= 85) return '⚠️ Regular'
  return '❌ Bajo'
}

export default function ReportesPage() {
  const [data,          setData]          = useState<ReportData | null>(null)
  const [period,        setPeriod]        = useState('month')
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState<'ns'|'overview'|'plataformas'|'conductores'|'comunas'>('ns')
  const [userRole,      setUserRole]      = useState<string>('')
  const [stores,        setStores]        = useState<{id:string;name:string}[]>([])
  const [storeExport,   setStoreExport]   = useState('')
  const [fechaExport,   setFechaExport]   = useState(new Date().toISOString().split('T')[0])
  const [loadingExport2,setLoadingExport2]= useState(false)

  useEffect(() => { load() }, [period])

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(d => {
      if (d?.user?.role) setUserRole(d.user.role)
    })
    fetch('/api/stores/list').then(r => r.json()).then(d => {
      if (d.ok) setStores(d.data)
    })
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
      ['Total pedidos',          data.summary.total],
      ['Entregados',             data.summary.delivered],
      ['NS Hoy',                 data.summary.nsHoy !== null ? `${data.summary.nsHoy}%` : '—'],
      ['NS del período',         `${data.summary.successRate}%`],
      ['En camino',              data.summary.inTransit],
      ['Incidencias',            data.summary.incidents],
      ['Tiempo promedio entrega',`${data.avgDelivery.avgHours}h`],
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
        'Salida a ruta':     o.salidaRuta  || '—',
        'Entregado en':      o.entregadoEn || '—',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{wch:14},{wch:16},{wch:20},{wch:16},{wch:24},{wch:28},{wch:16},{wch:14},{wch:28},{wch:20},{wch:20}]
      const wb = XLSX.utils.book_new()
      const nombreTienda = stores.find(s => s.id === storeExport)?.name ?? 'todas'
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
      XLSX.writeFile(wb, `reporte_${nombreTienda}_${fechaExport}.xlsx`)
    } catch { alert('Error exportando') }
    finally { setLoadingExport2(false) }
  }

  if (loading && !data) return (
    <div style={{ padding:60, textAlign:'center', color:'#9CA3AF' }}>
      <div style={{ fontSize:32, marginBottom:10 }}>📊</div>
      <div>Cargando reportes...</div>
    </div>
  )

  const s = data?.summary

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:500 }}>Reportes y métricas</h1>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:3 }}>
            {PERIOD_LABEL[period]} {loading ? '· Actualizando...' : ''}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <select value={period} onChange={e=>setPeriod(e.target.value)}
            style={{ padding:'7px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', fontFamily:'inherit' }}>
            {Object.entries(PERIOD_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={exportCSV} disabled={!data}
            style={{ padding:'7px 14px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', cursor:'pointer' }}>
            ⬇ CSV
          </button>
        </div>
      </div>

      {s && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 3fr', gap:14, marginBottom:20 }}>
          <div style={{ background:'#0B1628', borderRadius:12, padding:24, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>NS Hoy</div>
            <div style={{ fontSize:64, fontWeight:800, color: s.nsHoy !== null ? nsColor(s.nsHoy) : '#4B5563', lineHeight:1, marginBottom:8 }}>
              {s.nsHoy !== null ? `${s.nsHoy}%` : '—'}
            </div>
            <div style={{ fontSize:13, color: s.nsHoy !== null ? nsColor(s.nsHoy) : '#6B7280', fontWeight:500, marginBottom:12 }}>
              {nsLabel(s.nsHoy)}
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.35)', lineHeight:1.5 }}>
              {s.nsDelivered} entregados<br/>de {s.nsTotal} en ruta hoy
            </div>
            {s.nsHoy !== null && (
              <div style={{ width:'100%', marginTop:14 }}>
                <div style={{ height:6, background:'rgba(255,255,255,.1)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:`${s.nsHoy}%`, height:'100%', background: nsColor(s.nsHoy), borderRadius:3, transition:'width .6s' }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'rgba(255,255,255,.2)', marginTop:3 }}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            <KPICard label="En ruta hoy"     value={s.inTransit}   accent="#2563EB" sub="pedidos activos"/>
            <KPICard label="Entregados hoy"  value={s.nsDelivered} accent="#16A34A" sub="con evidencia"/>
            <KPICard label="Incidencias"     value={s.incidents}   accent="#DC2626" sub={s.nsTotal>0?`${Math.round(s.incidents/(s.nsTotal||1)*100)}% del total`:'del período'}/>
            <KPICard label="Tiempo promedio" value={data?.avgDelivery.avgHours ? `${data.avgDelivery.avgHours}h` : '—'} accent="#7C3AED" sub="creación a entrega"/>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:0, marginBottom:16, borderBottom:'1px solid #E2E8F0', overflowX:'auto' }}>
        {([
          { key:'ns',          label:'📊 NS Diario' },
          { key:'overview',    label:'📈 Evolución' },
          { key:'plataformas', label:'🔗 Plataformas' },
          { key:'conductores', label:'🚚 Conductores' },
          { key:'comunas',     label:'📍 Comunas' },
        ] as {key:typeof tab;label:string}[]).map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'10px 18px', fontSize:13, fontWeight:tab===t.key?500:400, background:'none', border:'none', cursor:'pointer', whiteSpace:'nowrap',
              color: tab===t.key?'#2563EB':'#6B7280', borderBottom:`2px solid ${tab===t.key?'#2563EB':'transparent'}`, marginBottom:-1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ns' && data && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>Nivel de Servicio — Últimos 14 días</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>% pedidos entregados sobre pedidos que salieron a ruta ese día</div>
            <NSChart data={data.nsDiario}/>
          </div>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>Detalle por día</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#F8FAFC' }}>
                  {['Fecha','En ruta','Entregados','Incidencias','NS%','Estado'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.nsDiario].reverse().map((d, i) => (
                  <tr key={d.date} style={{ background: i%2===0?'white':'#FAFAFA' }}>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>{d.label}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>{d.inTransit || '—'}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid #F1F5F9', fontSize:13, color:'#16A34A', fontWeight:500 }}>{d.delivered || '—'}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid #F1F5F9', fontSize:13, color: d.incident>0?'#DC2626':'#9CA3AF' }}>{d.incident || '—'}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid #F1F5F9' }}>
                      {d.ns !== null ? <span style={{ fontSize:14, fontWeight:700, color: nsColor(d.ns) }}>{d.ns}%</span>
                        : <span style={{ fontSize:12, color:'#D1D5DB' }}>Sin datos</span>}
                    </td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid #F1F5F9', fontSize:12 }}>
                      {d.ns !== null ? (
                        <span style={{ padding:'2px 8px', borderRadius:20, background: d.ns>=95?'#F0FDF4':d.ns>=85?'#FFFBEB':'#FFF1F2', color: nsColor(d.ns), fontWeight:500 }}>
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

      {tab === 'overview' && data && (
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>Pedidos por día</div>
            <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:18 }}>Total de pedidos creados en el período</div>
            <BarChart data={data.byDay} maxItems={30}/>
          </div>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:16 }}>Distribución del período</div>
            {s && [
              { label:'Entregados',    value:s.delivered, color:'#16A34A' },
              { label:'En camino',     value:s.inTransit, color:'#2563EB' },
              { label:'Recepcionados', value:s.received,  color:'#7C3AED' },
              { label:'Incidencias',   value:s.incidents, color:'#DC2626' },
            ].map(item => {
              const base = s.delivered + s.inTransit + s.received + s.incidents
              return (
                <div key={item.label} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'#4B5563' }}>{item.label}</span>
                    <span style={{ fontWeight:500 }}>{item.value}</span>
                  </div>
                  <div style={{ height:6, background:'#F1F5F9', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ width: base>0?`${Math.round(item.value/base*100)}%`:'0%', height:'100%', background:item.color, borderRadius:3, transition:'width .4s' }}/>
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop:16, padding:'12px 14px', background:'#F8FAFC', borderRadius:8 }}>
              <div style={{ fontSize:11, color:'#6B7280', marginBottom:2 }}>NS del período</div>
              <div style={{ fontSize:22, fontWeight:700, color: nsColor(s.successRate) }}>{s.successRate}%</div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>{s.delivered} entregados de {s.total} totales</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'plataformas' && data && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:16 }}>Pedidos por plataforma</div>
            {data.byPlatform.map(p => (
              <div key={p.platform} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:10,height:10,borderRadius:'50%',background:PLAT_COLOR[p.platform]||'#6B7280',flexShrink:0,display:'inline-block' }}/>
                    <span style={{ fontSize:13 }}>{PLATFORM_LABEL[p.platform]||p.platform}</span>
                  </div>
                  <div style={{ display:'flex', gap:10, fontSize:12 }}>
                    <span style={{ fontWeight:500 }}>{p.count}</span>
                    <span style={{ color:'#9CA3AF' }}>{p.pct}%</span>
                  </div>
                </div>
                <div style={{ height:8, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ width:`${p.pct}%`, height:'100%', background:PLAT_COLOR[p.platform]||'#6B7280', borderRadius:4, transition:'width .4s' }}/>
                </div>
              </div>
            ))}
          </div>
          {data.byStore.length > 0 && (
            <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:16 }}>Top tiendas</div>
              {data.byStore.map((s, i) => (
                <div key={s.storeId} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>
                  <span style={{ width:22,height:22,borderRadius:'50%',background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,flexShrink:0 }}>{i+1}</span>
                  <span style={{ flex:1 }}>{s.storeName}</span>
                  <span style={{ fontWeight:500 }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'conductores' && data && (
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>
            Entregas por conductor — {PERIOD_LABEL[period]}
          </div>
          {data.byDriver.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Sin datos para este período</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#F8FAFC' }}>
                {['#','Conductor','Entregas','Rendimiento'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.byDriver.sort((a,b)=>b.delivered-a.delivered).map((d, i) => {
                  const max = data.byDriver[0]?.delivered || 1
                  const pct = Math.round(d.delivered / max * 100)
                  return (
                    <tr key={d.driverId}>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9', fontSize:13, color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32,height:32,borderRadius:'50%',background:'#0B1628',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:500,color:'white' }}>
                            {d.driverName.slice(0,2).toUpperCase()}
                          </div>
                          {d.driverName}
                        </div>
                      </td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9', fontSize:22, fontWeight:600, color:'#2563EB' }}>{d.delivered}</td>
                      <td style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9', minWidth:200 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ flex:1, height:8, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
                            <div style={{ width:`${pct}%`, height:'100%', background:'#2563EB', borderRadius:4 }}/>
                          </div>
                          <span style={{ fontSize:12, color:'#9CA3AF', flexShrink:0 }}>{pct}%</span>
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

      {tab === 'comunas' && data && (
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>
            Top comunas — {PERIOD_LABEL[period]}
          </div>
          {data.byComuna.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Sin datos para este período</div>
          ) : (
            <div style={{ padding:20 }}>
              {data.byComuna.map((c, i) => {
                const max = data.byComuna[0]?.count || 1
                const pct = Math.round(c.count / max * 100)
                return (
                  <div key={c.comuna} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                      <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, color:'#9CA3AF', minWidth:20 }}>{i+1}.</span>
                        <strong>{c.comuna}</strong>
                        <span style={{ fontSize:11, color:'#9CA3AF' }}>{c.region}</span>
                      </span>
                      <span style={{ fontWeight:500 }}>{c.count}</span>
                    </div>
                    <div style={{ height:6, background:'#F1F5F9', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:'#2563EB', borderRadius:3, transition:'width .4s' }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Reporte por tienda — solo SUPER_ADMIN ── */}
      {userRole === 'SUPER_ADMIN' && (
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20, marginTop:16 }}>
          <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>📥 Reporte por tienda</div>
          <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:16 }}>
            Descarga el Excel de pedidos del día por tienda — estados En camino, Entregado y No entregado
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <select value={storeExport} onChange={e => setStoreExport(e.target.value)}
              style={{ padding:'7px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', fontFamily:'inherit', minWidth:200 }}>
              <option value="">Todas las tiendas</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" value={fechaExport} onChange={e => setFechaExport(e.target.value)}
              style={{ padding:'7px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'inherit' }}/>
            <button onClick={exportTienda} disabled={loadingExport2}
              style={{ padding:'7px 16px', background:loadingExport2?'#86EFAC':'#16A34A', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loadingExport2?'not-allowed':'pointer' }}>
              {loadingExport2 ? '⏳ Generando...' : '⬇ Descargar Excel'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

function KPICard({ label, value, accent, sub, change }: { label:string; value:string|number; accent:string; sub?:string; change?:number }) {
  return (
    <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'18px 20px', borderLeft:`3px solid ${accent}` }}>
      <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
        <div style={{ fontSize:26, fontWeight:600, lineHeight:1 }}>{value}</div>
        {change !== undefined && change !== 0 && (
          <span style={{ fontSize:12, fontWeight:500, color: change>0?'#16A34A':'#DC2626' }}>
            {change>0?'▲':'▼'} {Math.abs(change)}%
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function NSChart({ data }: { data: NsDay[] }) {
  const hasData = data.some(d => d.ns !== null)
  if (!hasData) return (
    <div style={{ textAlign:'center', padding:'40px 0', color:'#9CA3AF', fontSize:13 }}>
      Sin datos de NS por día todavía
    </div>
  )
  return (
    <div>
      <div style={{ position:'relative', height:140, marginBottom:8 }}>
        <div style={{ position:'absolute', top:'5%', left:0, right:0, borderTop:'1px dashed #16A34A', opacity:.4 }}>
          <span style={{ position:'absolute', right:0, top:-10, fontSize:9, color:'#16A34A' }}>95%</span>
        </div>
        <div style={{ position:'absolute', top:'15%', left:0, right:0, borderTop:'1px dashed #D97706', opacity:.4 }}>
          <span style={{ position:'absolute', right:0, top:-10, fontSize:9, color:'#D97706' }}>85%</span>
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:'100%' }}>
          {data.map((d, i) => {
            const height = d.ns !== null ? `${d.ns}%` : '0%'
            const color  = d.ns !== null ? (d.ns>=95?'#16A34A':d.ns>=85?'#D97706':'#DC2626') : '#F1F5F9'
            return (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', height:'100%', justifyContent:'flex-end' }}
                title={d.ns !== null ? `${d.label}: NS ${d.ns}% (${d.delivered}/${d.inTransit})` : `${d.label}: Sin datos`}>
                <div style={{ width:'100%', background:color, borderRadius:'3px 3px 0 0', minHeight: d.ns!==null?2:0, height, transition:'height .4s', opacity: d.ns!==null?.9:.3 }}/>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display:'flex', gap:4 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:'center', fontSize:9, color:'#9CA3AF', overflow:'hidden' }}>
            {i % 2 === 0 ? d.label : ''}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:16, marginTop:10, fontSize:11 }}>
        <span style={{ display:'flex', alignItems:'center', gap:4, color:'#16A34A' }}><span style={{ width:10,height:10,borderRadius:2,background:'#16A34A',display:'inline-block' }}/> ≥95% Excelente</span>
        <span style={{ display:'flex', alignItems:'center', gap:4, color:'#D97706' }}><span style={{ width:10,height:10,borderRadius:2,background:'#D97706',display:'inline-block' }}/> 85-94% Regular</span>
        <span style={{ display:'flex', alignItems:'center', gap:4, color:'#DC2626' }}><span style={{ width:10,height:10,borderRadius:2,background:'#DC2626',display:'inline-block' }}/> &lt;85% Bajo</span>
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
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, height:'100%', justifyContent:'flex-end' }}
            title={`${d.label}: ${d.total} pedidos`}>
            <div style={{ width:'100%', background:'#2563EB', borderRadius:'2px 2px 0 0', opacity:.85, minHeight: d.total>0?2:0,
              height:`${Math.round(d.total/max*100)}%`, transition:'height .3s' }}/>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:3 }}>
        {visible.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:'center', fontSize:9, color:'#9CA3AF', overflow:'hidden' }}>
            {i % Math.max(1, Math.floor(visible.length / 6)) === 0 ? d.label : ''}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:14, marginTop:8, fontSize:11, color:'#6B7280' }}>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ width:10,height:10,borderRadius:2,background:'#2563EB',display:'inline-block' }}/>
          Pedidos creados
        </span>
      </div>
    </div>
  )
}
