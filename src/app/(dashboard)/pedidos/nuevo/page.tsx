'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const COMUNAS_RM = ['Santiago', 'Providencia', 'Las Condes', 'Ñuñoa', 'Vitacura', 'La Florida', 'Maipú', 'Pudahuel', 'Lo Barnechea', 'Peñalolén', 'La Reina', 'Macul', 'San Miguel', 'La Cisterna']
const REGIONES  = ['Metropolitana', 'Valparaíso', 'Biobío', 'La Araucanía', 'Los Lagos', "O'Higgins", 'Maule', 'Antofagasta', 'Coquimbo', 'Atacama', 'Tarapacá', 'Arica y Parinacota', 'Aysén', 'Magallanes']

const TIPOS_SERVICIO = [
  { value: 'entrega',  label: '📦 Entrega',          desc: 'Entrega normal de pedido al cliente' },
  { value: 'retiro',   label: '🔄 Retiro',            desc: 'Retiro de producto desde el cliente' },
  { value: 'cambio',   label: '↔️ Cambio',            desc: 'Retiro y entrega simultánea de productos' },
]

const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', background:'white' }
const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }
const card: React.CSSProperties = { background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20, marginBottom:14 }
const sec: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:14 }

export default function NuevoPedidoPage() {
  const router = useRouter()
  const [stores,  setStores]  = useState<{id:string;name:string}[]>([])
  const [form,    setForm]    = useState({
    storeId: '', customerName: '', customerPhone: '', customerEmail: '',
    addressStreet: '', addressComuna: '', addressRegion: 'Metropolitana',
    addressNotes: '', bultos: 1, weightKg: '', customCode: '',
    tipoServicio: 'entrega',
    // Campos para retiro/cambio
    retiroStreet: '', retiroComuna: '', retiroNotes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.data.length > 0) {
          setStores(d.data)
          setForm(f => ({ ...f, storeId: d.data[0].id }))
        }
      })
  }, [])

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.storeId) { setError('Debes seleccionar una tienda'); return }
    setLoading(true); setError('')
    try {
      // Construir notas con info de retiro/cambio si aplica
      let notasCompletas = form.addressNotes
      if (form.tipoServicio === 'retiro') {
        notasCompletas = `[RETIRO] Retirar en: ${form.retiroStreet}, ${form.retiroComuna}${form.retiroNotes ? ` — ${form.retiroNotes}` : ''}`
      } else if (form.tipoServicio === 'cambio') {
        notasCompletas = `[CAMBIO] Entregar en: ${form.addressStreet}, ${form.addressComuna} — Retirar en: ${form.retiroStreet}, ${form.retiroComuna}${form.retiroNotes ? ` — ${form.retiroNotes}` : ''}${form.addressNotes ? ` — ${form.addressNotes}` : ''}`
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId:       form.storeId,
          customerName:  form.customerName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail,
          addressStreet: form.tipoServicio === 'retiro' ? form.retiroStreet : form.addressStreet,
          addressComuna: form.tipoServicio === 'retiro' ? form.retiroComuna : form.addressComuna,
          addressRegion: form.addressRegion,
          addressNotes:  notasCompletas,
          bultos:        form.bultos,
          weightKg:      form.weightKg ? Number(form.weightKg) : undefined,
          sourceId:      form.customCode || undefined,
          subStoreName:  form.tipoServicio !== 'entrega'
            ? form.tipoServicio === 'retiro' ? 'RETIRO' : 'CAMBIO'
            : undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      router.push(`/recepciones/${data.data.id}`)
    } catch (e: any) {
      setError(e.message ?? 'Error creando pedido')
      setLoading(false)
    }
  }

  const esRetiro = form.tipoServicio === 'retiro'
  const esCambio = form.tipoServicio === 'cambio'

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:500 }}>Nuevo pedido</h1>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:3 }}>Se generará un QR y número de pedido automáticamente</p>
      </div>

      {error && (
        <div style={{ background:'#FFF1F2', border:'1px solid #FECDD3', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#9F1239', marginBottom:14 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* Tipo de servicio */}
        <div style={card}>
          <div style={sec}>Tipo de servicio</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {TIPOS_SERVICIO.map(t => (
              <button key={t.value} type="button"
                onClick={() => set('tipoServicio', t.value)}
                style={{
                  padding:'14px 12px', borderRadius:10, cursor:'pointer', textAlign:'center',
                  border: form.tipoServicio === t.value ? 'none' : '1px solid #E2E8F0',
                  background: form.tipoServicio === t.value ? '#EFF6FF' : 'white',
                  outline: form.tipoServicio === t.value ? '2px solid #2563EB' : 'none',
                  transition:'all .15s',
                }}>
                <div style={{ fontSize:20, marginBottom:6 }}>{t.label.split(' ')[0]}</div>
                <div style={{ fontSize:13, fontWeight:600, color: form.tipoServicio === t.value ? '#1D4ED8' : '#374151' }}>
                  {t.label.split(' ').slice(1).join(' ')}
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:3, lineHeight:1.3 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tienda */}
        <div style={card}>
          <div style={sec}>Tienda</div>
          {stores.length === 0 ? (
            <div style={{ fontSize:13, color:'#9CA3AF' }}>
              No hay tiendas creadas. <a href="/tiendas" style={{ color:'#2563EB' }}>Crear una tienda primero →</a>
            </div>
          ) : (
            <div>
              <label style={lbl}>Tienda de origen *</label>
              <select required style={inp} value={form.storeId} onChange={e => set('storeId', e.target.value)}>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Cliente */}
        <div style={card}>
          <div style={sec}>Datos del cliente</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label style={lbl}>Nombre completo *</label>
              <input required style={inp} placeholder="Ej: María González" value={form.customerName} onChange={e => set('customerName', e.target.value)}/>
            </div>
            <div>
              <label style={lbl}>Teléfono</label>
              <input style={inp} placeholder="+56 9 xxxx xxxx" value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)}/>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Email</label>
              <input type="email" style={inp} placeholder="cliente@email.com" value={form.customerEmail} onChange={e => set('customerEmail', e.target.value)}/>
            </div>
          </div>
        </div>

        {/* Dirección de entrega — solo si no es retiro puro */}
        {!esRetiro && (
          <div style={card}>
            <div style={sec}>{esCambio ? 'Dirección de entrega' : 'Dirección de entrega'}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Calle y número *</label>
                <input required style={inp} placeholder="Av. Providencia 1234, depto 501" value={form.addressStreet} onChange={e => set('addressStreet', e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Comuna *</label>
                <input required list="comunas" style={inp} placeholder="Ej: Providencia" value={form.addressComuna} onChange={e => set('addressComuna', e.target.value)}/>
                <datalist id="comunas">{COMUNAS_RM.map(c => <option key={c} value={c}/>)}</datalist>
              </div>
              <div>
                <label style={lbl}>Región *</label>
                <select required style={inp} value={form.addressRegion} onChange={e => set('addressRegion', e.target.value)}>
                  {REGIONES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Notas de entrega</label>
                <input style={inp} placeholder="Referencias, instrucciones especiales..." value={form.addressNotes} onChange={e => set('addressNotes', e.target.value)}/>
              </div>
            </div>
          </div>
        )}

        {/* Dirección de retiro — solo si es retiro o cambio */}
        {(esRetiro || esCambio) && (
          <div style={{ ...card, border:'1px solid #FDE68A', background:'#FFFBEB' }}>
            <div style={{ ...sec, color:'#92400E' }}>
              {esCambio ? '🔄 Dirección de retiro' : '🔄 Dirección de retiro'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Calle y número *</label>
                <input required style={inp} placeholder="Dirección donde se retira el producto" value={form.retiroStreet} onChange={e => set('retiroStreet', e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Comuna *</label>
                <input required list="comunas-retiro" style={inp} placeholder="Ej: Providencia" value={form.retiroComuna} onChange={e => set('retiroComuna', e.target.value)}/>
                <datalist id="comunas-retiro">{COMUNAS_RM.map(c => <option key={c} value={c}/>)}</datalist>
              </div>
              {esRetiro && (
                <div>
                  <label style={lbl}>Región</label>
                  <select style={inp} value={form.addressRegion} onChange={e => set('addressRegion', e.target.value)}>
                    {REGIONES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Notas de retiro</label>
                <input style={inp} placeholder="Instrucciones para el conductor al retirar..." value={form.retiroNotes} onChange={e => set('retiroNotes', e.target.value)}/>
              </div>
            </div>
          </div>
        )}

        {/* Detalles del envío */}
        <div style={card}>
          <div style={sec}>Detalles del envío</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label style={lbl}>N° de bultos *</label>
              <input required type="number" min={1} max={99} style={inp} value={form.bultos} onChange={e => set('bultos', Number(e.target.value))}/>
            </div>
            <div>
              <label style={lbl}>Peso total (kg)</label>
              <input type="number" step="0.1" min={0} style={inp} placeholder="0.0" value={form.weightKg} onChange={e => set('weightKg', e.target.value)}/>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Código personalizado <span style={{ color:'#9CA3AF', fontWeight:400 }}>(opcional)</span></label>
              <input style={inp} placeholder="Ej: MU12345, ORD-001, #567..." value={form.customCode} onChange={e => set('customCode', e.target.value)}/>
              <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>Código interno de tu tienda. Aparecerá en la etiqueta y podrás buscar por él.</div>
            </div>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button type="button" onClick={() => router.back()}
            style={{ padding:'10px 18px', border:'1px solid #E2E8F0', borderRadius:8, background:'white', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
            Cancelar
          </button>
          <button type="submit" disabled={loading || stores.length === 0}
            style={{ padding:'10px 20px', background:loading?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loading?'not-allowed':'pointer', fontFamily:'inherit' }}>
            {loading ? 'Creando...' : `Crear ${form.tipoServicio === 'retiro' ? 'retiro' : form.tipoServicio === 'cambio' ? 'cambio' : 'pedido'} y generar QR`}
          </button>
        </div>
      </form>
    </div>
  )
}
