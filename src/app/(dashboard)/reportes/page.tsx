'use client'
import { useEffect, useState } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Summary {
  total:number; previous:number; change:number
  delivered:number; pending:number; inTransit:number
  received:number; incidents:number; successRate:number
}
interface DayData  { date:string; label:string; total:number; delivered:number }
interface PlatData { platform:string; count:number; pct:number }
interface StoreData{ storeId:string; storeName:string; count:number }
interface DriverData{ driverId:string; driverName:string; delivered:number }
interface ComunaData{ comuna:string; region:string; count:number }
interface AvgDelivery{ avgHours:number; count:number }

interface ReportData {
  summary:     Summary
  byDay:       DayData[]
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ReportesPage() {
  const [data,    setData]    = useState<ReportData | null>(null)
  const [period,  setPeriod]  = useState('month')
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'overview'|'plataformas'|'conductores'|'comunas'>('overview')

  useEffect(() => { load() }, [period])

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
      ['Entregados',    data.summary.delivered],
      ['Tasa de éxito', `${data.summary.successRate}%`],
      ['En camino',     data.summary.inTransit],
      ['Incidencias',   data.summary.incidents],
      ['Tiempo promedio entrega', `${data.avgDelivery.avgHours}h`],
      [],
      ['Fecha','Total','Entregados'],
      ...data.byDay.map(d => [d.label, d.total, d.delivered]),
    ]
    const csv  = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `reporte_sendflow_${period}.csv`; a.click()
    URL.revokeObjectURL(url)
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
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:500 }}>Reportes y métricas</h1>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:3 }}>
            {PERIOD_LABEL[period]} {loading ? '· Actualizando...' : ''}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {/* Selector período */}
          <select value={period} onChange={e=>setPeriod(e.target.value)}
            style={{ padding:'7px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', fontFamily:'inherit' }}>
            {Object.entries(PERIOD_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={exportCSV} disabled={!data}
            style={{ padding:'7px 14px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            ⬇ Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      {s && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12, marginBottom:20 }}>
          <KPICard label="Total pedidos"    value={s.total}       change={s.change}       accent="#2563EB" sub={`vs período anterior`}/>
          <KPICard label="Tasa de éxito"   value={`${s.successRate}%`} accent="#16A34A" sub={`${s.delivered} entregados`}/>
          <KPICard label="Incidencias"     value={s.incidents}    accent="#DC2626" sub={s.total>0?`${Math.round(s.incidents/s.total*100)}% del total`:''}/>
          <KPICard label="Tiempo promedio" value={data?.avgDelivery.avgHours ? `${data.avgDelivery.avgHours}h` : '—'} accent="#7C3AED" sub="desde creación a entrega"/>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:16, borderBottom:'1px solid #E2E8F0' }}>
        {([
          { key:'overview',     label:'📈 Evolución' },
          { key:'plataformas',  label:'🔗 Plataformas' },
          { key:'conductores',  label:'🚚 Conductores' },
          { key:'comunas',      label:'📍 Comunas' },
        ] as {key:typeof tab;label:string}[]).map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'10px 18px', fontSize:13, fontWeight:tab===t.key?500:400, background:'none', border:'none', cursor:'pointer',
              color:        tab===t.key ? '#2563EB' : '#6B7280',
              borderBottom: `2px solid ${tab===t.key ? '#2563EB' : 'transparent'}`,
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Evolución ── */}
      {tab === 'overview' && data && (
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
          {/* Gráfico de barras de pedidos por día */}
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:18 }}>Pedidos por día</div>
            <BarChart data={data.byDay} maxItems={30}/>
          </div>

          {/* Estado actual */}
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:16 }}>Distribución de estados</div>
            {s && [
              { label:'Entregados',   value:s.delivered, color:'#7C3AED' },
              { label:'En camino',    value:s.inTransit, color:'#16A34A' },
              { label:'Recepcionados',value:s.received,  color:'#2563EB' },
              { label:'Pendientes',   value:s.pending,   color:'#D97706' },
              { label:'Incidencias',  value:s.incidents, color:'#DC2626' },
            ].map(item => (
              <div key={item.label} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                  <span style={{ color:'#4B5563' }}>{item.label}</span>
                  <span style={{ fontWeight:500 }}>{item.value}</span>
                </div>
                <div style={{ height:6, background:'#F1F5F9', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width: s.total > 0 ? `${Math.round(item.value/s.total*100)}%` : '0%', height:'100%', background:item.color, borderRadius:3, transition:'width .4s' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Plataformas ── */}
      {tab === 'plataformas' && data && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:16 }}>Pedidos por plataforma</div>
            {data.byPlatform.map(p => (
              <div key={p.platform} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:10, height:10, borderRadius:'50%', background:PLAT_COLOR[p.platform]||'#6B7280', flexShrink:0, display:'inline-block' }}/>
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

          {/* Por tienda */}
          {data.byStore.length > 0 && (
            <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:16 }}>Top tiendas</div>
              {data.byStore.map((s, i) => (
                <div key={s.storeId} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, flexShrink:0 }}>{i+1}</span>
                  <span style={{ flex:1 }}>{s.storeName}</span>
                  <span style={{ fontWeight:500 }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Conductores ── */}
      {tab === 'conductores' && data && (
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>
            Entregas por conductor — {PERIOD_LABEL[period]}
          </div>
          {data.byDriver.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
              Sin datos de conductores para este período
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#F8FAFC' }}>
                {['#','Conductor','Entregas realizadas','Rendimiento'].map(h => (
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
                          <div style={{ width:32, height:32, borderRadius:'50%', background:'#0B1628', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500, color:'white' }}>
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

      {/* ── Tab: Comunas ── */}
      {tab === 'comunas' && data && (
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>
            Top comunas con más envíos — {PERIOD_LABEL[period]}
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
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KPICard({ label, value, accent, sub, change }: { label:string; value:string|number; accent:string; sub?:string; change?:number }) {
  return (
    <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'18px 20px', borderLeft:`3px solid ${accent}` }}>
      <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
        <div style={{ fontSize:26, fontWeight:600, lineHeight:1 }}>{value}</div>
        {change !== undefined && change !== 0 && (
          <span style={{ fontSize:12, fontWeight:500, color: change > 0 ? '#16A34A' : '#DC2626' }}>
            {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function BarChart({ data, maxItems = 30 }: { data: DayData[]; maxItems?: number }) {
  const visible = data.slice(-maxItems)
  const max     = Math.max(...visible.map(d => d.total), 1)

  return (
    <div>
      {/* Barras */}
      <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:120, marginBottom:6 }}>
        {visible.map((d, i) => (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, height:'100%', justifyContent:'flex-end' }} title={`${d.label}: ${d.total} pedidos, ${d.delivered} entregados`}>
            <div style={{ width:'100%', background:'#2563EB', borderRadius:'2px 2px 0 0', opacity:.85, minHeight: d.total > 0 ? 2 : 0,
              height: `${Math.round(d.total/max*100)}%`, transition:'height .3s' }}/>
          </div>
        ))}
      </div>
      {/* Labels (cada 5 días) */}
      <div style={{ display:'flex', gap:3 }}>
        {visible.map((d, i) => (
          <div key={i} style={{ flex:1, textAlign:'center', fontSize:9, color:'#9CA3AF', overflow:'hidden' }}>
            {i % Math.max(1, Math.floor(visible.length / 6)) === 0 ? d.label : ''}
          </div>
        ))}
      </div>
      {/* Leyenda */}
      <div style={{ display:'flex', gap:14, marginTop:8, fontSize:11, color:'#6B7280' }}>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ width:10, height:10, borderRadius:2, background:'#2563EB', display:'inline-block' }}/>
          Pedidos creados
        </span>
      </div>
    </div>
  )
}
