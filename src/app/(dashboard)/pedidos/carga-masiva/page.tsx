'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Store { id: string; name: string; slug: string }
interface RowPreview {
  customerName: string; customerPhone: string; customerEmail: string
  addressStreet: string; addressComuna: string; addressRegion: string
  addressNotes: string; bultos: number; weightKg: number
  valid: boolean; error: string
}

export default function CargaMasivaPage() {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)
  const [stores,   setStores]   = useState<Store[]>([])
  const [storeId,  setStoreId]  = useState('')
  const [rows,     setRows]     = useState<RowPreview[]>([])
  const [fileName, setFileName] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [step,     setStep]     = useState<1|2|3>(1)
  const [result,   setResult]   = useState<{created:number;errors:string[]}|null>(null)

  useEffect(() => {
    fetch('/api/stores').then(r => r.json()).then(d => {
      if (d.ok && d.data.length > 0) {
        setStores(d.data)
        setStoreId(d.data[0].id)
      }
    })
  }, [])

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
      const customerName  = get(r,'Nombre','nombre','Cliente','cliente','Name')
      const customerPhone = get(r,'Teléfono','Telefono','telefono','Phone','Tel')
      const customerEmail = get(r,'Email','email','correo')
      const addressStreet = get(r,'Dirección','Direccion','direccion','Address','Calle')
      const addressComuna = get(r,'Comuna','comuna','City','ciudad')
      const addressRegion = get(r,'Región','Region','region','State') || 'Metropolitana'
      const addressNotes  = get(r,'Notas','notas','Notes','Referencias')
      const bultos        = Number(get(r,'Bultos','bultos','Qty','cantidad') || '1') || 1
      const weightKg      = Number(get(r,'Peso','peso','Weight','kg') || '0') || 0
      const missing: string[] = []
      if (!customerName)  missing.push('Nombre')
      if (!addressStreet) missing.push('Dirección')
      if (!addressComuna) missing.push('Comuna')
      return { customerName, customerPhone, customerEmail, addressStreet, addressComuna, addressRegion, addressNotes, bultos, weightKg, valid: missing.length===0, error: missing.length>0 ? `Faltan: ${missing.join(', ')}` : '' }
    })

    setRows(preview)
    setStep(2)
    setLoading(false)
  }

  async function handleImport() {
    if (!storeId) return
    const store = stores.find(s => s.id === storeId)
    setLoading(true)
    const validRows = rows.filter(r => r.valid)
    const res = await fetch('/api/orders/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, storeName: store?.name, platform: 'MANUAL', rows: validRows }),
    })
    const data = await res.json()
    setResult(data.ok ? data.data : { created: 0, errors: [data.error] })
    setStep(3)
    setLoading(false)
  }

  function downloadTemplate() {
    import('xlsx').then(XLSX => {
      const data = [
        ['Nombre','Teléfono','Email','Dirección','Comuna','Región','Notas','Bultos','Peso'],
        ['María González','+56912345678','maria@email.com','Av. Providencia 1234','Providencia','Metropolitana','Timbre 3B','1','0.5'],
        ['Juan Pérez','+56987654321','','Los Leones 456','Las Condes','Metropolitana','','2','1.2'],
      ]
      const ws = XLSX.utils.aoa_to_sheet(data)
      ws['!cols'] = [{wch:20},{wch:14},{wch:22},{wch:28},{wch:14},{wch:16},{wch:20},{wch:8},{wch:8}]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
      XLSX.writeFile(wb, 'plantilla_sendflow.xlsx')
    })
  }

  const validCount   = rows.filter(r => r.valid).length
  const invalidCount = rows.filter(r => !r.valid).length

  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }

  return (
    <div style={{ maxWidth:900 }}>
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
      {step===1&&(
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:24 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:16 }}>Selecciona tienda y archivo</div>
            {stores.length===0?(
              <div style={{ background:'#FFF7ED', border:'1px solid #FDE68A', borderRadius:8, padding:16, marginBottom:16, fontSize:13, color:'#92400E' }}>
                No hay tiendas activas. <Link href="/tiendas" style={{ color:'#2563EB' }}>Crea una tienda primero</Link>
              </div>
            ):(
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }}>Tienda destino</label>
                <select style={inp} value={storeId} onChange={e=>setStoreId(e.target.value)}>
                  {stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div onClick={()=>fileRef.current?.click()}
              onMouseOver={e=>(e.currentTarget.style.borderColor='#2563EB')}
              onMouseOut={e=>(e.currentTarget.style.borderColor='#E2E8F0')}
              style={{ border:'2px dashed #E2E8F0', borderRadius:10, padding:'32px 24px', textAlign:'center', cursor:'pointer', transition:'all .12s' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📊</div>
              <div style={{ fontSize:14, fontWeight:500, marginBottom:4 }}>Haz clic o arrastra tu archivo</div>
              <div style={{ fontSize:12, color:'#9CA3AF' }}>.xlsx o .xls — máximo 1000 filas</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display:'none' }}/>
            </div>
          </div>

          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:24 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>Columnas requeridas</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {[
                {col:'Nombre',    req:true,  desc:'Nombre completo del cliente'},
                {col:'Dirección', req:true,  desc:'Calle y número'},
                {col:'Comuna',    req:true,  desc:'Comuna de entrega'},
                {col:'Región',    req:false, desc:'Default: Metropolitana'},
                {col:'Teléfono',  req:false, desc:'Teléfono del cliente'},
                {col:'Email',     req:false, desc:'Email del cliente'},
                {col:'Bultos',    req:false, desc:'N° de bultos (default: 1)'},
                {col:'Peso',      req:false, desc:'Peso en kg'},
                {col:'Notas',     req:false, desc:'Notas de entrega'},
              ].map(c=>(
                <div key={c.col} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                  <span style={{ padding:'1px 8px', borderRadius:4, fontSize:11, fontWeight:500, fontFamily:'monospace', background:c.req?'#EFF6FF':'#F1F5F9', color:c.req?'#1D4ED8':'#6B7280', flexShrink:0 }}>
                    {c.col}
                  </span>
                  <span style={{ color:'#6B7280' }}>{c.desc}</span>
                  {c.req&&<span style={{ marginLeft:'auto', fontSize:10, color:'#9F1239', fontWeight:500 }}>*requerido</span>}
                </div>
              ))}
            </div>
            <button onClick={downloadTemplate} style={{ width:'100%', padding:'10px', background:'#0B1628', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
              ⬇ Descargar plantilla Excel
            </button>
          </div>
        </div>
      )}

      {/* PASO 2 */}
      {step===2&&rows.length>0&&(
        <div>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:16, marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
              <div style={{ fontSize:13 }}><span style={{ fontWeight:500 }}>Archivo:</span> {fileName}</div>
              <div style={{ fontSize:13 }}><span style={{ fontWeight:500 }}>Total:</span> {rows.length} filas</div>
              <span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, background:'#F0FDF4', color:'#166534', fontWeight:500 }}>✓ {validCount} válidas</span>
              {invalidCount>0&&<span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, background:'#FFF1F2', color:'#9F1239', fontWeight:500 }}>✗ {invalidCount} con errores</span>}
              <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                <button onClick={()=>{setStep(1);setRows([]);setFileName('')}} style={{ padding:'7px 14px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:12, background:'white', cursor:'pointer' }}>
                  ← Cambiar archivo
                </button>
                {validCount>0&&(
                  <button onClick={handleImport} disabled={loading} style={{ padding:'7px 18px', background:loading?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loading?'not-allowed':'pointer' }}>
                    {loading?'Importando...': `⬆ Importar ${validCount} pedido${validCount!==1?'s':''}`}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
            <div style={{ maxHeight:400, overflowY:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                  <tr style={{ background:'#F8FAFC' }}>
                    {['#','Estado','Nombre','Dirección','Comuna','Teléfono','Bultos'].map(h=>(
                      <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row,i)=>(
                    <tr key={i} style={{ background:row.valid?'white':'#FFF8F8' }}>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9' }}>
                        {row.valid
                          ?<span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#F0FDF4', color:'#166534', fontWeight:500 }}>✓ OK</span>
                          :<span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#FFF1F2', color:'#9F1239', fontWeight:500 }} title={row.error}>✗ Error</span>
                        }
                      </td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>{row.customerName||<span style={{color:'#F87171'}}>—</span>}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.addressStreet||<span style={{color:'#F87171'}}>—</span>}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{row.addressComuna||<span style={{color:'#F87171'}}>—</span>}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{row.customerPhone||'—'}</td>
                      <td style={{ padding:'9px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13, textAlign:'center' }}>{row.bultos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PASO 3 */}
      {step===3&&result&&(
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:40, textAlign:'center' }}>
          {result.created>0?(
            <>
              <div style={{ fontSize:48, marginBottom:14 }}>✅</div>
              <div style={{ fontSize:20, fontWeight:500, marginBottom:6 }}>¡Importación exitosa!</div>
              <div style={{ fontSize:15, color:'#6B7280', marginBottom:20 }}>
                Se crearon <strong style={{ color:'#166534' }}>{result.created} pedido{result.created!==1?'s':''}</strong> correctamente
              </div>
              {result.errors.length>0&&(
                <div style={{ background:'#FFF7ED', border:'1px solid #FDE68A', borderRadius:8, padding:12, marginBottom:16, textAlign:'left', fontSize:12, color:'#92400E' }}>
                  <strong>{result.errors.length} filas no importadas:</strong>
                  {result.errors.map((e,i)=><div key={i} style={{ marginTop:4 }}>• {e}</div>)}
                </div>
              )}
              <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                <Link href="/recepciones" style={{ padding:'10px 22px', background:'#2563EB', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
                  Ver pedidos →
                </Link>
                <button onClick={()=>{setStep(1);setRows([]);setFileName('');setResult(null)}}
                  style={{ padding:'10px 18px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', cursor:'pointer' }}>
                  Nueva carga
                </button>
              </div>
            </>
          ):(
            <>
              <div style={{ fontSize:48, marginBottom:14 }}>❌</div>
              <div style={{ fontSize:18, fontWeight:500, marginBottom:16 }}>No se importó ningún pedido</div>
              <button onClick={()=>{setStep(1);setRows([]);setFileName('');setResult(null)}}
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
