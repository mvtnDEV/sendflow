'use client'
import { useEffect, useState } from 'react'
import { clasificarZona } from '@/lib/utils/zonas'

// Adapta la zona compartida al vocabulario que ya usaba esta página.
function getTipoTarifa(comuna: string): 'urbana' | 'extraUrbana' | 'rural' {
  const z = clasificarZona(comuna)
  return z === 'RURAL' ? 'rural' : z === 'EXTRA_URBANA' ? 'extraUrbana' : 'urbana'
}

const IVA_RATE = 0.19
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
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

interface StoreFactura {
  store: {
    id: string; name: string; rut: string | null; encargado: string | null
    tarifaUrbana: number | null; tarifaExtraUrbana: number | null
    tarifaRural: number | null; tarifaRetiro: number | null
    fechaTarifa: string | null
  }
  orders: {
    id: string; orderNumber: string; customerName: string
    addressStreet: string; addressComuna: string; addressRegion: string
    deliveredAt: string; inTransitAt: string; bultos: number; platform: string
  }[]
  total: number
  resumenMargen: {
    ingresoNeto: number; costoNeto: number; margenNeto: number
    pedidosConCosto: number; pedidosSinCosto: number; conRetiro: number
  }
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
      [storeId]: { ...prev[storeId], [orderId]: !prev[storeId]?.[orderId] },
    }))
  }

  function calcFactura(sf: StoreFactura) {
    const { store, orders } = sf
    let totalUrbana = 0, totalExtraUrbana = 0, totalRural = 0, totalRetiro = 0
    let countUrbana = 0, countExtraUrbana = 0, countRural = 0, countRetiro = 0

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

    const neto         = totalUrbana + totalExtraUrbana + totalRural + totalRetiro
    const iva           = neto * IVA_RATE
    const totalConIva   = neto + iva

    return {
      totalUrbana, totalExtraUrbana, totalRural, totalRetiro,
      countUrbana, countExtraUrbana, countRural, countRetiro,
      neto, iva, totalConIva,
      total: neto, // alias para no romper la UI existente que usa calc.total
    }
  }

  function getTarifaYTipo(sf: StoreFactura, o: StoreFactura['orders'][number]) {
    const { store } = sf
    const tipo     = getTipoTarifa(o.addressComuna)
    const esRetiro = retiroMap[store.id]?.[o.id] ?? false
    const tipoLabel = esRetiro ? 'Retiro' : tipo === 'urbana' ? 'Urbana' : tipo === 'extraUrbana' ? 'Extra Urbana' : 'Rural'
    let tarifa = 0
    if (esRetiro)                    tarifa = store.tarifaRetiro      ?? 0
    else if (tipo === 'urbana')      tarifa = store.tarifaUrbana      ?? 0
    else if (tipo === 'extraUrbana') tarifa = store.tarifaExtraUrbana ?? 0
    else                             tarifa = store.tarifaRural       ?? 0
    return { tipo, tipoLabel, tarifa, esRetiro }
  }

  // ── Construye las filas de detalle por tienda con todos los campos pedidos ──
  function buildDetalle(sf: StoreFactura) {
    return sf.orders.map(o => {
      const { tipoLabel, tarifa } = getTarifaYTipo(sf, o)
      const neto = tarifa
      const iva  = neto * IVA_RATE
      const totalConIva = neto + iva
      return {
        'ID Pedido':    o.orderNumber,
        'Cliente':      o.customerName,
        'Dirección':    o.addressStreet,
        'Comuna':       o.addressComuna,
        'Región':       o.addressRegion,
        'Tienda':       sf.store.name,
        'Fecha Entrega': o.deliveredAt
          ? new Date(o.deliveredAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
          : (o.inTransitAt ? new Date(o.inTransitAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : '—'),
        'Tipo':         tipoLabel,
        'Neto':         Math.round(neto),
        'IVA (19%)':    Math.round(iva),
        'Total c/IVA':  Math.round(totalConIva),
        'Bultos':       o.bultos,
      }
    })
  }

  function buildResumen(sf: StoreFactura) {
    const calc  = calcFactura(sf)
    const { store, orders } = sf

    function fila(label: string, count: number, tarifa: number) {
      const neto = count * tarifa
      const iva  = neto * IVA_RATE
      const totalConIva = neto + iva
      return [`${label}:`, `${count} × ${fmt(tarifa)}`, fmt(neto), fmt(iva), fmt(totalConIva)]
    }

    return [
      ['FACTURA DE SERVICIOS', '', '', '', ''],
      ['', '', '', '', ''],
      ['Tienda:', store.name, '', '', ''],
      ['RUT:', store.rut ?? 'Sin RUT', '', '', ''],
      ['Encargado:', store.encargado ?? '—', '', '', ''],
      ['Período:', getMesLabel(mes), '', '', ''],
      ['Tarifa vigente:', store.fechaTarifa ?? '—', '', '', ''],
      ['', '', '', '', ''],
      ['RESUMEN', 'Cantidad × Tarifa', 'Neto', 'IVA (19%)', 'Total c/IVA'],
      fila('Pedidos Urbanos', calc.countUrbana, store.tarifaUrbana ?? 0),
      fila('Pedidos Extra Urbanos', calc.countExtraUrbana, store.tarifaExtraUrbana ?? 0),
      fila('Pedidos Rurales', calc.countRural, store.tarifaRural ?? 0),
      fila('Pedidos Retiro', calc.countRetiro, store.tarifaRetiro ?? 0),
      ['', '', '', '', ''],
      ['TOTAL PEDIDOS:', String(orders.length), '', '', ''],
      ['TOTAL NETO:', '', fmt(calc.neto), '', ''],
      ['TOTAL IVA (19%):', '', '', fmt(calc.iva), ''],
      ['TOTAL A COBRAR (c/IVA):', '', '', '', fmt(calc.totalConIva)],
    ]
  }

  async function exportarExcel(sf: StoreFactura) {
    const XLSX = await import('xlsx')
    const detalle = buildDetalle(sf)
    const resumen = buildResumen(sf)

    const wbDetalle = XLSX.utils.json_to_sheet(detalle)
    wbDetalle['!cols'] = [
      {wch:14},{wch:24},{wch:28},{wch:16},{wch:16},{wch:18},
      {wch:14},{wch:14},{wch:12},{wch:12},{wch:13},{wch:8},
    ]
    const wbResumen = XLSX.utils.aoa_to_sheet(resumen)
    wbResumen['!cols'] = [{wch:24},{wch:20},{wch:16},{wch:14},{wch:16}]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wbResumen, 'Resumen')
    XLSX.utils.book_append_sheet(wb, wbDetalle, 'Detalle')
    const nombreMes = getMesLabel(mes).replace(' ', '_')
    XLSX.writeFile(wb, `factura_${sf.store.name.replace(/\s+/g,'_')}_${nombreMes}.xlsx`)
  }

  async function exportarTodas() {
    const XLSX = await import('xlsx')
    const wb   = XLSX.utils.book_new()

    data.filter(sf => sf.total > 0).forEach(sf => {
      const resumen = buildResumen(sf)
      const ws = XLSX.utils.aoa_to_sheet(resumen)
      ws['!cols'] = [{wch:24},{wch:20},{wch:16},{wch:14},{wch:16}]
      const sheetName = `Resumen ${sf.store.name}`.slice(0, 31).replace(/[\\\/\?\*\[\]]/g, '')
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    })

    // ── Hoja única con el listado completo de todas las tiendas ──
    const detalleTotal = data.filter(sf => sf.total > 0).flatMap(sf => buildDetalle(sf))
    if (detalleTotal.length > 0) {
      const wsDetalle = XLSX.utils.json_to_sheet(detalleTotal)
      wsDetalle['!cols'] = [
        {wch:14},{wch:24},{wch:28},{wch:16},{wch:16},{wch:18},
        {wch:14},{wch:14},{wch:12},{wch:12},{wch:13},{wch:8},
      ]
      XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle Todos')
    }

    const nombreMes = getMesLabel(mes).replace(' ', '_')
    XLSX.writeFile(wb, `facturas_todas_${nombreMes}.xlsx`)
  }

  const totalGeneralNeto      = data.reduce((acc, sf) => acc + calcFactura(sf).neto, 0)
  const totalGeneralIva       = data.reduce((acc, sf) => acc + calcFactura(sf).iva, 0)
  const totalGeneralConIva    = data.reduce((acc, sf) => acc + calcFactura(sf).totalConIva, 0)

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:500 }}>Facturación</h1>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:3 }}>
            Pedidos despachados × tarifa por tipo de zona — Neto + IVA (19%)
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
              Total a facturar (c/IVA) — {getMesLabel(mes)}
            </div>
            <div style={{ fontSize:32, fontWeight:700, color:'white' }}>{fmt(totalGeneralConIva)}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:4 }}>
              Neto: {fmt(totalGeneralNeto)} · IVA: {fmt(totalGeneralIva)}
            </div>
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
                      <div style={{ fontSize:18, fontWeight:700, color:'#16A34A' }}>{fmt(calc.totalConIva)}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>{sf.total} pedidos · neto {fmt(calc.neto)}</div>
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
                      <div style={{ padding:'8px 14px', borderRadius:8, background:'#0B1628', minWidth:160, display:'flex', flexDirection:'column', justifyContent:'center' }}>
                        <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:3 }}>NETO / IVA / TOTAL</div>
                        <div style={{ fontSize:12, color:'rgba(255,255,255,.8)' }}>{fmt(calc.neto)} + {fmt(calc.iva)}</div>
                        <div style={{ fontSize:16, fontWeight:700, color:'white' }}>{fmt(calc.totalConIva)}</div>
                      </div>
                      {/* Margen: ingreso menos lo que cobra el operador. Todo neto. */}
                      {(() => {
                        const rm = sf.resumenMargen
                        if (!rm) return null
                        const pct = rm.ingresoNeto > 0 ? Math.round((rm.margenNeto / rm.ingresoNeto) * 100) : 0
                        return (
                          <div style={{ padding:'8px 14px', borderRadius:8, background:'#052E24', minWidth:190, display:'flex', flexDirection:'column', justifyContent:'center' }}>
                            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:3 }}>MARGEN NETO</div>
                            <div style={{ fontSize:16, fontWeight:700, color:'#34D399' }}>{fmt(rm.margenNeto)} <span style={{ fontSize:11, fontWeight:500, opacity:.8 }}>({pct}%)</span></div>
                            <div style={{ fontSize:11, color:'rgba(255,255,255,.6)' }}>ingreso {fmt(rm.ingresoNeto)} − costo {fmt(rm.costoNeto)}</div>
                            {rm.pedidosSinCosto > 0 && (
                              <div style={{ fontSize:10, color:'#FBBF24', marginTop:3 }}>
                                {rm.pedidosSinCosto} sin tarifa de operador cargada
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
                        <thead>
                          <tr style={{ background:'#F8FAFC' }}>
                            {['ID Pedido','Cliente','Dirección','Comuna','Región','Tienda','Tipo','Neto','IVA','Total c/IVA','Retiro','Entregado'].map(h => (
                              <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sf.orders.map((o, i) => {
                            const { tipo, tipoLabel, tarifa, esRetiro } = getTarifaYTipo(sf, o)
                            const neto = tarifa
                            const iva  = neto * IVA_RATE
                            const totalConIva = neto + iva
                            return (
                              <tr key={o.id} style={{ background: i%2===0?'white':'#FAFAFA' }}>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500, color:'#1D4ED8', fontFamily:'monospace' }}>{o.orderNumber}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>{o.customerName}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{o.addressStreet}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, color:'#6B7280' }}>{o.addressComuna}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{o.addressRegion}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{sf.store.name}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9' }}>
                                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:500,
                                    background: esRetiro?'#FEF3C7':tipo==='urbana'?'#EFF6FF':tipo==='extraUrbana'?'#F5F3FF':'#F0FDF4',
                                    color:      esRetiro?'#92400E':tipo==='urbana'?'#1D4ED8':tipo==='extraUrbana'?'#5B21B6':'#166534',
                                  }}>
                                    {tipoLabel}
                                  </span>
                                </td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, color:'#374151' }}>{fmt(neto)}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, color:'#6B7280' }}>{fmt(iva)}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:600, color:'#16A34A' }}>{fmt(totalConIva)}</td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', textAlign:'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={esRetiro}
                                    onChange={() => toggleRetiro(sf.store.id, o.id)}
                                    style={{ width:16, height:16, cursor:'pointer', accentColor:'#D97706' }}
                                  />
                                </td>
                                <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#9CA3AF' }}>
                                  {o.deliveredAt
                                    ? new Date(o.deliveredAt).toLocaleDateString('es-CL', { timeZone:'America/Santiago', day:'2-digit', month:'short' })
                                    : '—'}
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
