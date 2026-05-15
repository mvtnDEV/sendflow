'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

const NEXT_STATUSES: Record<string, { status: string; label: string; primary?: boolean }[]> = {
  PENDING:    [{ status:'RECEIVED',   label:'Recepcionar en bodega', primary:true }],
  RECEIVED:   [{ status:'IN_TRANSIT', label:'Marcar en camino',      primary:true }],
  IN_TRANSIT: [
    { status:'DELIVERED', label:'Marcar como entregado', primary:true },
    { status:'INCIDENT',  label:'Reportar incidencia' },
  ],
  INCIDENT:   [{ status:'IN_TRANSIT', label:'Reintentar entrega', primary:true }],
  DELIVERED:  [
    { status:'INCIDENT',  label:'Reportar problema post-entrega' },
    { status:'CANCELLED', label:'Anular pedido' },
  ],
  CANCELLED:  [],
}

const inp: React.CSSProperties = {
  width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0',
  borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit',
}
const lbl: React.CSSProperties = {
  fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5,
}

export default function OrderActions({
  orderId, currentStatus, userRole,
}: {
  orderId:       string
  currentStatus: string
  userRole:      string
}) {
  const router   = useRouter()
  const photoRef = useRef<HTMLInputElement>(null)

  const [loading,   setLoading]   = useState<string | null>(null)
  const [error,     setError]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [photo,     setPhoto]     = useState('')
  const [receptor,  setReceptor]  = useState('')
  const [rut,       setRut]       = useState('')
  const [note,      setNote]      = useState('')

  const actions = NEXT_STATUSES[currentStatus] ?? []

  async function changeStatus(status: string) {
    if (status === 'DELIVERED') { setShowModal(true); return }
    setLoading(status); setError('')
    try {
      const res  = await fetch(`/api/orders/${orderId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      router.refresh()
    } catch (e: any) {
      setError(e.message ?? 'Error actualizando estado')
    } finally {
      setLoading(null)
    }
  }

  async function sendToEnviosNow() {
    setLoading('ENVIOSNOW'); setError('')
    try {
      const res  = await fetch(`/api/orders/${orderId}/send-enviosnow`, { method:'POST' })
      const data = await res.json()
      if (data.ok) alert('✅ Enviado a Envios Now correctamente')
      else setError(`Error Envios Now: ${data.error}`)
    } catch {
      setError('Error de conexión con Envios Now')
    } finally {
      setLoading(null)
    }
  }

  function loadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('Imagen máx 5MB'); return }
    const r = new FileReader()
    r.onload = ev => setPhoto(ev.target?.result as string)
    r.readAsDataURL(file)
  }

  async function confirmDelivery() {
    setLoading('DELIVERED'); setError('')
    try {
      const res  = await fetch(`/api/orders/${orderId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          status:         'DELIVERED',
          note:           note || undefined,
          evidencePhoto1: photo || undefined,
          receptorName:   receptor || undefined,
          receptorRut:    rut || undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setShowModal(false)
      router.refresh()
    } catch (e: any) {
      setError(e.message ?? 'Error marcando como entregado')
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
        <div style={{ fontSize:12, fontWeight:500, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12 }}>Acciones</div>

        {error && (
          <div style={{ background:'#FFF1F2', border:'1px solid #FECDD3', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#9F1239', marginBottom:10 }}>
            {error}
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {actions.length === 0 ? (
            <div style={{ fontSize:13, color:'#9CA3AF', textAlign:'center', padding:'10px 0' }}>
              Sin acciones de estado disponibles
            </div>
          ) : (
            actions.map(action => (
              <button key={action.status} onClick={() => changeStatus(action.status)} disabled={!!loading}
                style={{
                  padding:'10px', borderRadius:8, fontSize:13, fontWeight:500,
                  cursor:loading?'not-allowed':'pointer', fontFamily:'inherit',
                  border: action.primary ? 'none' : '1px solid #E2E8F0',
                  background: action.primary
                    ? (loading===action.status ? '#93C5FD' : '#2563EB')
                    : action.status === 'CANCELLED' ? '#FFF1F2'
                    : action.status === 'INCIDENT'  ? '#FFFBEB'
                    : 'white',
                  color: action.primary ? 'white'
                    : action.status === 'CANCELLED' ? '#9F1239'
                    : action.status === 'INCIDENT'  ? '#92400E'
                    : '#374151',
                  opacity: loading && loading !== action.status ? 0.5 : 1,
                }}>
                {loading === action.status ? 'Actualizando...' : action.label}
              </button>
            ))
          )}

          {/* Botón Envios Now — solo SUPER_ADMIN */}
          {userRole === 'SUPER_ADMIN' && (
            <>
              <div style={{ borderTop:'1px solid #F1F5F9', margin:'4px 0' }}/>
              <button onClick={sendToEnviosNow} disabled={!!loading}
                style={{
                  padding:'10px', borderRadius:8, fontSize:13, fontWeight:500,
                  cursor:loading?'not-allowed':'pointer', fontFamily:'inherit',
                  border:'1px solid #E2E8F0', background:'white', color:'#374151',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  opacity: loading && loading !== 'ENVIOSNOW' ? 0.5 : 1,
                }}>
                {loading === 'ENVIOSNOW' ? 'Enviando...' : '🚚 Reenviar a Envios Now'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Modal entrega manual */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background:'white', borderRadius:16, padding:28, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:4 }}>✅ Confirmar entrega</div>
            <div style={{ fontSize:13, color:'#6B7280', marginBottom:20 }}>Registra los datos de quien recibió el pedido</div>

            {error && (
              <div style={{ background:'#FFF1F2', border:'1px solid #FECDD3', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#9F1239', marginBottom:14 }}>
                {error}
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
              <div>
                <label style={lbl}>Nombre de quien recibe</label>
                <input style={inp} placeholder="Ej: Juan Pérez" value={receptor} onChange={e => setReceptor(e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>RUT de quien recibe</label>
                <input style={inp} placeholder="Ej: 12.345.678-9" value={rut} onChange={e => setRut(e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Nota de entrega</label>
                <input style={inp} placeholder="Ej: Entregado al portero, vecino, etc." value={note} onChange={e => setNote(e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Foto de evidencia</label>
                {photo ? (
                  <div style={{ position:'relative' }}>
                    <img src={photo} alt="Evidencia"
                      style={{ width:'100%', borderRadius:8, maxHeight:200, objectFit:'cover', border:'1px solid #E2E8F0' }}/>
                    <button onClick={() => { setPhoto(''); if(photoRef.current) photoRef.current.value='' }}
                      style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.6)', border:'none', borderRadius:20, color:'white', fontSize:12, padding:'4px 12px', cursor:'pointer' }}>
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => photoRef.current?.click()}
                    style={{ width:'100%', padding:'20px', background:'#F8FAFC', border:'2px dashed #E2E8F0', borderRadius:8, cursor:'pointer', fontSize:13, color:'#9CA3AF' }}>
                    📷 Subir foto de evidencia (opcional)
                  </button>
                )}
                <input ref={photoRef} type="file" accept="image/*" onChange={loadPhoto} style={{ display:'none' }}/>
              </div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setShowModal(false); setError('') }}
                style={{ flex:1, padding:'10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', cursor:'pointer', fontFamily:'inherit' }}>
                Cancelar
              </button>
              <button onClick={confirmDelivery} disabled={!!loading}
                style={{ flex:2, padding:'10px', background:loading?'#93C5FD':'#16A34A', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:loading?'not-allowed':'pointer', fontFamily:'inherit' }}>
                {loading ? 'Guardando...' : '✅ Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
