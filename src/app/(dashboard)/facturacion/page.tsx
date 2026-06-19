'use client'
import { useEffect, useState } from 'react'

// ── Clasificación de comunas por zona ──
const COMUNAS_EXTRA_URBANAS = ['colina', 'padre hurtado']
const COMUNAS_RURALES = [
  'paine', 'pirque', 'til til', 'tiltil', 'melipilla',
  'peñaflor', 'penaflor', 'isla de maipo', 'lampa',
]

function normalizarComuna(comuna: string): string {
  return comuna
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getTipoTarifa(comuna: string): 'urbana' | 'extraUrbana' | 'rural' {
  const c = normalizarComuna(comuna)
  if (COMUNAS_RURALES.some(r => c.includes(r) || r.includes(c))) return 'rural'
  if (COMUNAS_EXTRA_URBANAS.some(e => c.includes(e) || e.includes(c))) return 'extraUrbana'
  return 'urbana'
}

function getMesActual(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function getMesLabel(mes: string): string {
  const [year, month] = mes.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, 1)
  return date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
}
function fmt(n: number): string {
  return `$${n.toLocaleString('es-CL')}`
}

interface StoreFactura {
  store: {
    id:                string
    name:              string
    rut:               string | null
    encargado:         string | null
    tarifaUrbana:      number | null
    tarifaExtraUrbana: number | null
    tarifaRural:       number | null
    tarifaRetiro:      number | null
    fechaTarifa:       string | null
  }
  orders: {
    id:            string
    orderNumber:   string
    customerName:  string
    addressComuna: string
    addressRegion: string
    deliveredAt:   string
    bultos:        number
    platform:      string
  }[]
  total: number
}

export default function FacturacionPage() {
  const [mes,          setMes]          = useState(getMesActual())
  const [data,         setData]         = useState<StoreFactura[]>([])
  const [loading,      setLoading]      = useState(false)
  const [storeFilter,  setStoreFilter]  = useState('')
  const [retiroMap,    setRetiroMap]    = useState<Record<string, Record<string, boolean>>>({})
  const [expandedStore, setExpandedStore] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ mes })
      if (storeFilter) params.set('storeId', storeFilter)
      const res  = await fetch(`/api/facturacion?${params.toString()}`)
      const json = await res.json()
      if (json.ok) setData(json.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function toggleRetiro(storeId: string, orderId: string) {
    setRetiroMap(prev => ({
      ...prev,
      [storeId]: {
        ...prev[storeId],
        [orderId]: !prev[storeId]?.[orderId],
      },
    }))
  }

  function calcFactura(sf: StoreFactura) {
    const { store, orders } = sf
    let totalUrbana      = 0
    let totalExtraUrbana = 0
    let totalRural       = 0
    let totalRetiro      = 0
    let countUrbana      = 0
    let countExtraUrbana = 0
    let countRural       = 0
    let countRetiro      = 0

    orders.forEach(o => {
      const tipo     = getTipoTarifa(o.addressComuna)
      const esRetiro = retiroMap[store.id]?.[o.id] ?? false
      if (esRetiro) {
        totalRetiro += store.tarifaRetiro ?? 0
        countRetiro++
      } else if (tipo === 'urbana') {
        totalUrbana += store.tarifaUrbana ?? 0
        countUrbana++
      } else if (tipo === 'extraUrbana') {
        totalExtraUrbana += store.tarifaExtraUrbana ?? 0
        countExtraUrbana++
      } else {
        totalRural += store.tarifaRural ?? 0
        countRural++
      }
    })

    const total = totalUrbana + totalExtraUrbana + totalRural + totalRetiro
    return { totalUrbana, totalExtraUrbana, totalRural, totalRetiro, countUrbana, countExtraUrbana, countRural, countRetiro, total }
  }

  async function exportarExcel(sf: StoreFactura) {
    const XLSX  = await import('xlsx')
    const calc  = calcFactura(sf)
    const { store, orders } = sf

    const detalle = orders.map(o => {
      const tipo     = getTipoTarifa(o.addressComuna)
      const esRetiro = retiroMap[store.id]?.[o.id] ?? false
      let tipoLabel  = esRetiro ? 'Retiro' : tipo === 'urbana' ? 'Urbana' : tipo === 'extraUrbana' ? 'Extra Urbana' : 'Rural'
      let tarifa     = 0
      if (esRetiro)                     tarifa = store.tarifaRetiro      ?? 0
      else if (tipo === 'urbana')       tarifa = store.tarifaUrbana      ?? 0
      else if (tipo === 'extraUrbana')  tarifa = store.tarifaExtraUrbana ?? 0
      else                              tarifa = store.tarifaRural       ?? 0
      return {
        'N° Pedido':   o.orderNumber,
        'Cliente':     o.customerName,
        'Comuna':      o.addressComuna,
        'Tipo':        tipoLabel,
        'Entregado':   new Date(o.deliveredAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
        'Tarifa':      tarifa,
        'Bultos':      o.bultos,
      }
    })

    const resumen = [
      ['FACTURA DE SERVICIOS', ''],
      ['', ''],
      ['Tienda:', store.name],
      ['RUT:', store.rut ?? 'Sin RUT'],
      ['Encargado:', store.encargado ?? '—'],
      ['Período:', getMesLabel(mes)],
      ['Tarifa vigente:', store.fechaTarifa ?? '—'],
      ['', ''],
      ['RESUMEN', ''],
      ['Pedidos Urbanos:', `${calc.countUrbana} × ${fmt(store.tarifaUrbana ?? 0)} = ${fmt(calc.totalUrbana)}`],
      ['Pedidos Extra Urbanos:', `${calc.countExtraUrbana} × ${fmt(store.tarifaExtraUrbana ?? 0)} = ${fmt(calc.totalExtraUrbana)}`],
      ['Pedidos Rurales:', `${calc.countRural} × ${fmt(store.tarifaRural ?? 0)} = ${fmt(calc.totalRural)}`],
      ['Pedidos Retiro:', `${calc.countRetiro} × ${fmt(store.tarifaRetiro ?? 0)} = ${fmt(calc.totalRetiro)}`],
      ['', ''],
      ['TOTAL PEDIDOS:', orders.length],
      ['TOTAL A COBRAR:', calc.total],
    ]

    const wbDetalle = XLSX.utils.json_to_sheet(detalle)
    wbDetalle['!cols'] = [{wch:14},{wch:24},{wch:16},{wch:14},{wch:14},{wch:12},{wch:8}]
    const wbResumen = XLSX.utils.aoa_to_sheet(resumen)
    wbResumen['!cols'] = [{wch:24},{wch:40}]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wbResumen, 'Resumen')
    XLSX.utils.book_append_sheet(wb, wbDetalle, 'Detalle')
    const nombreMes = getMesLabel(mes).replace(' ', '_')
    XLSX.writeFile(wb, `factura_${store.name.replace(/\s+/g,'_')}_${nombreMes}.xlsx`)
  }

  async function exportarTodas() {
    const XLSX = await import('xlsx')
    const wb   = XLSX.utils.book_new()
    data.filter(sf => sf.total > 0).forEach(sf => {
      const calc  = calcFactura(sf)
      const { store, orders } = sf
      const resumen = [
        ['FACTURA DE SERVICIOS', ''],
        ['', ''],
        ['Tienda:', store.name],
        ['RUT:', store.rut ?? 'Sin RUT'],
        ['Encargado:', store.encargado ?? '—'],
        ['Período:', getMesLabel(mes)],
        ['Tarifa vigente:', store.fechaTarifa ?? '—'],
        ['', ''],
        ['RESUMEN', ''],
        ['Pedidos Urbanos:', `${calc.countUrbana} × ${fmt(store.tarifaUrbana ?? 0)} = ${fmt(calc.totalUrbana)}`],
        ['Pedidos Extra Urbanos:', `${calc.countExtraUrbana} × ${fmt(store.tarifaExtraUrbana ?? 0)} = ${fmt(calc.totalExtraUrbana)}`],
        ['Pedidos Rurales:', `${calc.countRural} × ${fmt(store.tarifaRural ?? 0)} = ${fmt(calc.totalRural)}`],
        ['Pedidos Retiro:', `${calc.countRetiro} × ${fmt(store.tarifaRetiro ?? 0)} = ${fmt(calc.totalRetiro)}`],
        ['', ''],
        ['TOTAL PEDIDOS:', orders.length],
        ['TOTAL A COBRAR:', calc.total],
      ]
      const ws = XLSX.utils.aoa_to_sheet(resumen)
      ws['!cols'] = [{wch:24},{wch:40}]
      const sheetName = store.name.slice(0, 31).replace(/[\\\/\?\*\[\]]/g, '')
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    })
    const nombreMes = getMesLabel(mes).replace(' ', '_')
    XLSX.writeFile(wb, `facturas_todas_${nombreMes}.xlsx`)
  }

  const totalGeneral = data.reduce((acc, sf) => acc + calcFactura(sf).total, 0)

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:500 }}>Facturación</h1>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:3 }}>
            Pedidos despachados × tarifa por tipo de zona
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <input
            type="month" value={mes}
            onChange={e => setMes(e.target.value)}
            style={{ padding:'7px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'inherit' }}
          />
          <button onClick={load} disabled={loading}
            style={{ padding:'7px 14px', background:'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
            {loading ? '⏳ Cargando...' : '🔍 Buscar'}
          </button>
          {data.some(sf => sf.total > 0) && (
            <button onClick={exportarTodas}
              style={{ padding:'7px 14px', background:'#16A34A', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
              ⬇ Exportar todas
            </button>
          )}
        </div>
      </div>

      {/* ── Leyenda de zonas ── */}
      <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#6B7280', display:'flex', gap:20, flexWrap:'wrap' }}>
        <span><strong style={{ color:'#5B21B6' }}>Extra Urbana:</strong> Colina, Padre Hurtado</span>
        <span><strong style={{ color:'#166534' }}>Rural:</strong> Paine, Pirque, Til Til, Melipilla, Peñaflor, Isla de Maipo, Lampa</span>
        <span><strong style={{ color:'#1D4ED8' }}>Urbana:</strong> Resto de comunas de la Región Metropolitana</span>
      </div>

      {/* ── Resumen total ── */}
      {data.length > 0 && (
        <div style={{ background:'#0B1628', borderRadius:12, padding:'16px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>
              Total a facturar — {getMesLabel(mes)}
            </div>
            <div style={{ fontSize:32, fontWeight:700, color:'white' }}>{fmt(totalGeneral)}</div>
          </div>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:600, color:'#38BDF8' }}>{data.reduce((a, sf) => a + sf.total, 0)}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>Pedidos totales</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:600, color:'#4ADE80' }}>{data.filter(sf => sf.total > 0).length}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>Tiendas activas</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:600, color:'#60A5FA' }}>
                {data.reduce((a, sf) => a + calcFactura(sf).countUrbana, 0)}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>Urbana</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:600, color:'#A78BFA' }}>
                {data.reduce((a, sf) => a + calcFactura(sf).countExtraUrbana, 0)}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>Extra Urbana</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:600, color:'#86EFAC' }}>
                {data.reduce((a, sf) => a + calcFactura(sf).countRural, 0)}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>Rural</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista de tiendas ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>💰</div>
          <div>Calculando facturación...</div>
        </div>
      ) : data.length === 0 ? (
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:48, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
          <div style={{ fontSize:15, fontWeight:500, marginBottom:6 }}>Sin datos</div>
          <div style={{ fontSize:13, color:'#6B7280' }}>Selecciona un mes y presiona Buscar</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {data.map(sf => {
            const calc     = calcFactura(sf)
            const expanded = expandedStore === sf.store.id
            return (
              <div key={sf.store.id} style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
                {/* Header tienda */}
                <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', flexWrap:'wrap', gap:10 }}
                  onClick={() => setExpandedStore(expanded ? null : sf.store.id)}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:'#0B1628', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, color:'white', flexShrink:0 }}>
                      {sf.store.name.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight:500, fontSize:15 }}>{sf.store.name}</div>
                      <div style={{ fontSize:12, color:'#6B7280', marginTop:1 }}>
                        {sf.store.rut && <span style={{ marginRight:10 }}>RUT: {sf.store.rut}</span>}
                        {sf.store.encargado && <span>👤 {sf.store.encargado}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                    <div style={{ display:'flex', gap:12, fontSize:12 }}>
                      {calc.countUrbana > 0      && <span style={{ color:'#1D4ED8' }}>{calc.countUrbana} urb.</span>}
                      {calc.countExtraUrbana > 0 && <span style={{ color:'#7C3AED' }}>{calc.countExtraUrbana} extra</span>}
                      {calc.countRural > 0       && <span style={{ color:'#166534' }}>{calc.countRural} rural</span>}
                      {calc.countRetiro > 0      && <span style={{ color:'#92400E' }}>{calc.countRetiro} retiro</span>}
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:'#16A34A' }}>{fmt(calc.total)}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>{sf.total} pedidos</div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button
                        onClick={e => { e.stopPropagation(); exportarExcel(sf) }}
                        style={{ padding:'6px 12px', background:'#16A34A', color:'white', border:'none', borderRadius:7, fontSize:12, fontWeight:500, cursor:'pointer' }}>
                        ⬇ Excel
                      </button>
                      <span style={{ fontSize:16, color:'#9CA3AF' }}>{expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {/* Resumen tarifas */}
                {expanded && (
                  <div>
                    <div style={{ padding:'12px 20px', background:'#F8FAFC', borderTop:'1px solid #F1F5F9', borderBottom:'1px solid #F1F5F9', display:'flex', gap:20, flexWrap:'wrap' }}>
                      {[
                        { label:'Urbana',       count:calc.countUrbana,      total:calc.totalUrbana,      tarifa:sf.store.tarifaUrbana,      color:'#EFF6FF', text:'#1D4ED8' },
                        { label:'Extra Urbana', count:calc.countExtraUrbana, total:calc.totalExtraUrbana, tarifa:sf.store.tarifaExtraUrbana, color:'#F5F3FF', text:'#5B21B6' },
                        { label:'Rural',        count:calc.countRural,       total:calc.totalRural,       tarifa:sf.store.tarifaRural,       color:'#F0FDF4', text:'#166534' },
                        { label:'Retiro',       count:calc.countRetiro,      total:calc.totalRetiro,      tarifa:sf.store.tarifaRetiro,      color:'#FFFBEB', text:'#92400E' },
                      ].map(t => (
                        <div key={t.label} style={{ padding:'8px 14px', borderRadius:8, background:t.color, minWidth:140 }}>
                          <div style={{ fontSize:11, color:t.text, fontWeight:600, marginBottom:3 }}>{t.label}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:t.text }}>{t.count} pedidos</div>
                          <div style={{ fontSize:11, color:t.text, opacity:.7 }}>{fmt(t.tarifa ?? 0)} c/u = {fmt(t.total)}</div>
                        </div>
                      ))}
                      <div style={{ padding:'8px 14px', borderRadius:8, background:'#0B1628', minWidth:140, display:'flex', flexDirection:'column', justifyContent:'center' }}>
                        <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:3 }}>TOTAL</div>
                        <div style={{ fontSize:18, fontWeight:700, color:'white' }}>{fmt(calc.total)}</div>
                      </div>
                    </div>

                    {/* Tabla de pedidos */}
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
                        <thead>
                          <tr style={{ background:'#F8FAFC' }}>
                            {['N° Pedido','Cliente','Comuna','Tipo','Tarifa','Retiro','Entregado'].map(h => (
                              <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sf.orders.map((o, i) => {
                            const tipo     = getTipoTarifa(o.addressComuna)
                            const esRetiro = retiroMap[sf.store.id]?.[o.id] ?? false
                            let tipoLabel  = esRetiro ? 'Retiro' : tipo === 'urbana' ? 'Urbana' : tipo === 'extraUrbana' ? 'Extra Urbana' : 'Rural'
                            let tarifa     = 0
                            if (esRetiro)                     tarifa = sf.store.tarifaRetiro      ?? 0
                            else if (tipo === 'urbana')       tarifa = sf.store.tarifaUrbana      ?? 0
                            else if (tipo === 'extraUrbana')  tarifa = sf.store.tarifaExtraUrbana ?? 0
                            else                               tarifa = sf.store.tarifaRural       ?? 0
                            return (
                              <tr key={o.id} style={{ background: i%2===0?'white':'#FAFAFA' }}>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500, color:'#1D4ED8', fontFamily:'monospace' }}>{o.orderNumber}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>{o.customerName}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, color:'#6B7280' }}>{o.addressComuna}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9' }}>
                                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:500,
                                    background: esRetiro?'#FEF3C7':tipo==='urbana'?'#EFF6FF':tipo==='extraUrbana'?'#F5F3FF':'#F0FDF4',
                                    color:      esRetiro?'#92400E':tipo==='urbana'?'#1D4ED8':tipo==='extraUrbana'?'#5B21B6':'#166534',
                                  }}>
                                    {tipoLabel}
                                  </span>
                                </td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:600, color:'#16A34A' }}>
                                  {fmt(tarifa)}
                                </td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', textAlign:'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={esRetiro}
                                    onChange={() => toggleRetiro(sf.store.id, o.id)}
                                    style={{ width:16, height:16, cursor:'pointer', accentColor:'#D97706' }}
                                  />
                                </td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#9CA3AF' }}>
                                  {new Date(o.deliveredAt).toLocaleDateString('es-CL', { timeZone:'America/Santiago', day:'2-digit', month:'short' })}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
