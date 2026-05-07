'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Store { id: string; name: string; slug: string }
interface RowPreview {
  customerName:  string
  customerPhone: string
  customerEmail: string
  addressStreet: string
  addressComuna: string
  addressRegion: string
  addressNotes:  string
  bultos:        number
  weightKg:      number
  storeName:     string
  storeId:       string | null
  valid:         boolean
  error:         string
}

export default function CargaMasivaPage() {
  const fileRef  = useRef<HTMLInputElement>(null)
  const [stores,   setStores]   = useState<Store[]>([])
  const [rows,     setRows]     = useState<RowPreview[]>([])
  const [fileName, setFileName] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [step,     setStep]     = useState<1|2|3>(1)
  const [result,   setResult]   = useState<{ created: number; errors: string[] } | null>(null)

  useEffect(() => {
    fetch('/api/stores').then(r => r.json()).then(d => {
      if (d.ok) setStores(d.data)
    })
  }, [])

  function findStore(name: string): Store | null {
    if (!name) return null
    const n = name.toLowerCase().trim()
    return stores.find(s =>
      s.name.toLowerCase().trim() === n ||
      s.slug.toLowerCase().trim() === n ||
      s.name.toLowerCase().includes(n) ||
      n.includes(s.name.toLowerCase())
    ) ?? null
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setLoading(true)

    const XLSX = await import('xlsx')
    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf, { type: 'array' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

    const get = (row: any, ...keys: string[]) => {
      for (const k of keys) {
        const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
        if (v !== undefined && v !== '') return String(v).trim()
      }
      return ''
    }

    const preview: RowPreview[] = raw.map(r => {
      const customerName  = get(r, 'Nombre', 'nombre', 'Cliente', 'cliente', 'Name')
      const customerPhone = get(r, 'Teléfono', 'Telefono', 'telefono', 'Phone', 'Tel')
      const customerEmail = get(r, 'Email', 'email', 'correo')
      const addressStreet = get(r, 'Dirección', 'Direccion', 'direccion', 'Address', 'Calle', 'Domicilio')
      const addressComuna = get(r, 'Comuna', 'comuna', 'City', 'ciudad')
      const addressRegion = get(r, 'Región', 'Region', 'region', 'State') || 'Metropolitana'
      const addressNotes  = get(r, 'Notas', 'notas', 'Notes', 'Referencias')
      const bultos        = Number(get(r, 'Bultos', 'bultos', 'Qty', 'cantidad') || '1') || 1
      const weightKg      = Number(get(r, 'Peso', 'peso', 'Weight', 'kg') || '0') || 0
      const storeName     = get(r, 'Tienda', 'tienda', 'Store', 'store', 'Origen')

      const storeMatch    = findStore(storeName)
      const missing: string[] = []
      if (!customerName)  missing.push('Nombre')
      if (!addressStreet) missing.push('Dirección')
      if (!addressComuna) missing.push('Comuna')
      if (!storeName)     missing.push('Tienda')
      if (storeName && !storeMatch) missing.push(`Tienda "${storeName}" no encontrada`)

      return {
        customerName, customerPhone, customerEmail,
        addressStreet, addressComuna, addressRegion, addressNotes,
        bultos, weightKg,
        storeName,
        storeId: storeMatch?.id ?? null,
        valid:   missing.length === 0,
        error:   missing.length > 0 ? missing.join(', ') : '',
      }
    })

    setRows(preview)
    setStep(2)
    setLoading(false)
  }

  async function handleImport() {
    setLoading(true)
    const validRows = rows.filter(r => r.valid)
    const res = await fetch('/api/orders/bulk', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ platform: 'MANUAL', rows: validRows.map(r => ({ ...r, storeId: r.storeId })) }),
    })
    const data = await res.json()
    setResult(data.ok ? data.data : { created: 0, errors: [data.error] })
    setStep(3)
    setLoading(false)
  }

  function downloadTemplate() {
    import('xlsx').then(XLSX => {
      const storeNames = stores.map(s => s.name)
      const data = [
        ['Nombre', 'Teléfono', 'Email', 'Dirección', 'Comuna', 'Región', 'Notas', 'Bultos', 'Peso', 'Tienda'],
        ['María González', '+56912345678', 'maria@email.com', 'Av. Providencia 1234', 'Providencia', 'Metropolitana', 'Timbre 3B', '1', '0.5', storeNames[0] ?? 'Nombre tienda'],
        ['Juan Pérez', '+56987654321', '', 'Los Leones 456', 'Las Condes', 'Metropolitana', '', '2', '1.2', storeNames[1] ?? storeNames[0] ?? 'Nombre tienda'],
      ]
      const ws = XLSX.utils.aoa_to_sheet(data)
      ws['!cols'] = [{wch:20},{wch:14},{wch:22},{wch:28},{wch:14},{wch:16},{wch:20},{wch:8},{wch:8},{wch:20}]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
      XLSX.writeFile(wb, 'plantilla_sendflow.xlsx')
    })
  }

  const validCount   = rows.filter(r => r.valid).length
  const invalidCount = rows.filter(r => !r.valid).length

  // Resumen por tienda
  const byStore = rows.reduce((acc, r) => {
    const key = r.storeName || 'Sin tienda'
    if (!acc[key]) acc[key] = { valid: 0, invalid: 0, storeId: r.storeId }
    if (r.valid) acc[key].valid++
    else acc[key].invalid++
    return acc
  }, {} as Record<string, { valid: number; invalid: number; storeId: string | null }>)

  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }

  return (
    <div style={{ maxWidth:960 }}>
      <div style={{ marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
        <Link href="/recepciones" style={{ color:'#6B7280', fontSize:13 }}>← Volver</Link>
        <h1 style={{ fontSize:20, fontWeight:500 }}>Carga masiva desde Excel</h1>
      </div>

      {/* Steps */}
      <div style={{ display:'flex', gap:0, marginBottom:24, alignItems:'center' }}>
        {[{n:1,label:'Archivo'},{n:2,label:'Vista previa'},{n:3,label:'Resultado'}].map((s,i) => (
          <div key={s.n} style={{ display:'flex', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:500, background:step>=s.n?'#2563EB':'#E2E8F0', color:step>=s.n?'white':'#9CA3AF' }}>{s.n}</div>
              <span style={{ fontSize:13, color:step>=s.n?'#1C1C1E':'#9CA3AF', fontWeight:step===s.n?500:400 }}>{s.label}</span>
            </div>
            {i<2&&<div style={{ width:40, height:1, background:'#E2E8F0', margin:'0 12px' }}/>}
          </div>
        ))}
      </div>

      {/* PASO 1 */}
      {step === 1 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:24 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:16 }}>Sube tu archivo Excel</div>
            <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#1D4ED8' }}>
              El sistema asignará automáticamente cada pedido a la tienda correcta según la columna <strong>Tienda</strong> del Excel.
            </div>

            {/* Tiendas disponibles */}
            {stores.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'#4B5563', marginBottom:8 }}>Tiendas reconocidas en el sistema:</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {stores.map(s => (
                    <span key={s.id} style={{ fontSize:11, padding:'3px 10px', background:'#F0FDF4', color:'#166534', borderRadius:20, border:'1px solid #BBF7D0', fontWeight:500 }}>
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div onClick={() => fileRef.current?.click()}
              onMouseOver={e => (e.currentTarget.style.borderColor = '#2563EB')}
              onMouseOut={e  => (e.currentTarget.style.borderColor = '#E2E8F0')}
              style={{ border:'2px dashed #E2E8F0', borderRadius:10, padding:'32px 24px', textAlign:'center', cursor:'pointer', transition:'all .12s' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📊</div>
              <div style={{ fontSize:14, fontWeight:500, marginBottom:4 }}>Haz clic o arrastra tu archivo</div>
              <div style={{ fontSize:12, color:'#9CA3AF' }}>.xlsx o .xls — máximo 1000 filas</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display:'none' }}/>
            </div>
            {loading && <div style={{ textAlign:'center', marginTop:12, fontSize:13, color:'#6B7280' }}>Procesando archivo...</div>}
          </div>

          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:24 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>Columnas del Excel</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {[
                { col:'Nombre',    req:true,  desc:'Nombre completo del cliente' },
                { col:'Dirección', req:true,  desc:'Calle y número' },
                { col:'Comuna',    req:true,  desc:'Comuna de entrega' },
                { col:'Tienda',    req:true,  desc:'Nombre de la tienda en SendFlow' },
                { col:'Región',    req:false, desc:'Default: Metropolitana' },
                { col:'Teléfono',  req:false, desc:'Teléfono del cliente' },
                { col:'Email',     req:false, desc:'Email del cliente' },
                { col:'Bultos',    req:false, desc:'N° de bultos (default: 1)' },
                { col:'Peso',      req:false, desc:'Peso en kg' },
                { col:'Notas',     req:false, desc:'Notas de entrega' },
              ].map(c => (
                <div key={c.col} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                  <span style={{ padding:'1px 8px', borderRadius:4, fontSize:11, fontWeight:500, fontFamily:'monospace', background:c.req?'#EFF6FF':'#F1F5F9', color:c.req?'#1D4ED8':'#6B7280', flexShrink:0 }}>
                    {c.col}
                  </span>
                  <span style={{ color:'#6B7280' }}>{c.desc}</span>
                  {c.req && <span style={{ marginLeft:'auto', fontSize:10, color:'#9F1239', fontWeight:500 }}>*requerido</span>}
                </div>
              ))}
            </div>
            <button onClick={downloadTemplate}
              style={{ width:'100%', padding:'10px', background:'#0B1628', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
              ⬇ Descargar plantilla Excel
            </button>
          </div>
        </div>
      )}

      {/* PASO 2 */}
      {step === 2 && rows.length > 0 && (
        <div>
          {/* Resumen */}
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:16, marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', marginBottom:12 }}>
              <div style={{ fontSize:13 }}><span style={{ fontWeight:500 }}>Archivo:</span> {fileName}</div>
              <div style={{ fontSize:13 }}><span style={{ fontWeight:500 }}>Total:</span> {rows.length} filas</div>
              <span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, background:'#F0FDF4', color:'#166534', fontWeight:500 }}>✓ {validCount} válidas</span>
              {invalidCount > 0 && <span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, background:'#FFF1F2', color:'#9F1239', fontWeight:500 }}>✗ {invalidCount} con errores</span>}
              <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                <button onClick={() => { setStep(1); setRows([]); setFileName('') }}
                  style={{ padding:'7px 14px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:12, background:'white', cursor:'pointer' }}>
                  ← Cambiar archivo
                </button>
                {validCount > 0 && (
                  <button onClick={handleImport} disabled={loading}
                    style={{ padding:'7px 18px', background:loading?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loading?'not-allowed':'pointer' }}>
                    {loading ? 'Importando...' : `⬆ Importar ${validCount} pedido${validCount!==1?'s':''}`}
                  </button>
                )}
              </div>
            </div>

            {/* Resumen por tienda */}
            <div style={{ borderTop:'1px solid #F1F5F9', paddingTop:12 }}>
              <div style={{ fontSize:12, fontWeight:500, color:'#4B5563', marginBottom:8 }}>Resumen por tienda:</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {Object.entries(byStore).map(([name, stats]) => (
                  <div key={name} style={{ fontSize:12, padding:'4px 12px', borderRadius:8, border:`1px solid ${stats.storeId ? '#BBF7D0' : '#FECDD3'}`, background:stats.storeId ? '#F0FDF4' : '#FFF1F2' }}>
                    <span style={{ fontWeight:500, color:stats.storeId ? '#166534' : '#9F1239' }}>{name}</span>
                    <span style={{ color:'#6B7280', marginLeft:6 }}>{stats.valid} pedido{stats.valid!==1?'s':''}</span>
                    {stats.invalid > 0 && <span style={{ color:'#9F1239', marginLeft:4 }}>· {stats.invalid} error{stats.invalid!==1?'es':''}</span>}
                    {!stats.storeId && <span style={{ color:'#9F1239', marginLeft:4 }}>· No encontrada</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
            <div style={{ maxHeight:400, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                  <tr style={{ background:'#F8FAFC' }}>
                    {['#','Estado','Nombre','Dirección','Comuna','Teléfono','Bultos','Tienda'].map(h => (
                      <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ background:row.valid?'white':'#FFF8F8' }}>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9' }}>
                        {row.valid
                          ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#F0FDF4', color:'#166534', fontWeight:500 }}>✓ OK</span>
                          : <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#FFF1F2', color:'#9F1239', fontWeight:500 }} title={row.error}>✗ {row.error}</span>
                        }
                      </td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>{row.customerName || <span style={{ color:'#F87171' }}>—</span>}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.addressStreet || <span style={{ color:'#F87171' }}>—</span>}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{row.addressComuna || <span style={{ color:'#F87171' }}>—</span>}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{row.customerPhone || '—'}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13, textAlign:'center' }}>{row.bultos}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9' }}>
                        {row.storeId
                          ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#F0FDF4', color:'#166534', border:'1px solid #BBF7D0' }}>{row.storeName}</span>
                          : <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#FFF1F2', color:'#9F1239', border:'1px solid #FECDD3' }}>{row.storeName || '—'}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PASO 3 */}
      {step === 3 && result && (
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:40, textAlign:'center' }}>
          {result.created > 0 ? (
            <>
              <div style={{ fontSize:48, marginBottom:14 }}>✅</div>
              <div style={{ fontSize:20, fontWeight:500, marginBottom:6 }}>¡Importación exitosa!</div>
              <div style={{ fontSize:15, color:'#6B7280', marginBottom:20 }}>
                Se crearon <strong style={{ color:'#166534' }}>{result.created} pedido{result.created!==1?'s':''}</strong> correctamente
              </div>
              {result.errors.length > 0 && (
                <div style={{ background:'#FFF7ED', border:'1px solid #FDE68A', borderRadius:8, padding:12, marginBottom:16, textAlign:'left', fontSize:12, color:'#92400E' }}>
                  <strong>{result.errors.length} filas no importadas:</strong>
                  {result.errors.map((e, i) => <div key={i} style={{ marginTop:4 }}>• {e}</div>)}
                </div>
              )}
              <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                <Link href="/recepciones" style={{ padding:'10px 22px', background:'#2563EB', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
                  Ver pedidos →
                </Link>
                <button onClick={() => { setStep(1); setRows([]); setFileName(''); setResult(null) }}
                  style={{ padding:'10px 18px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', cursor:'pointer' }}>
                  Nueva carga
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize:48, marginBottom:14 }}>❌</div>
              <div style={{ fontSize:18, fontWeight:500, marginBottom:16 }}>No se importó ningún pedido</div>
              <button onClick={() => { setStep(1); setRows([]); setFileName(''); setResult(null) }}
                style={{ padding:'10px 20px', background:'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
                Intentar de nuevo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
