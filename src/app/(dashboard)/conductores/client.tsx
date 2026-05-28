'use client'
import { useState } from 'react'

interface Driver { id:string; name:string; email:string; phone:string|null; isActive:boolean; lastLoginAt:Date|null; storeId:string|null }
interface Store  { id:string; name:string }

export default function ConductoresClient({ drivers: initial, stores }: { drivers: Driver[]; stores: Store[] }) {
  const [drivers, setDrivers] = useState(initial)
  const [modal,   setModal]   = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState({ name:'', email:'', phone:'', pin:'', storeId: stores[0]?.id ?? '' })
  const [error,   setError]   = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', background:'var(--bg-input)', color:'var(--text-primary)' }
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'var(--text-secondary)', display:'block', marginBottom:5 }

  async function handleCreate() {
    if (!form.name || !form.email || !form.pin) { setError('Nombre, email y PIN son requeridos'); return }
    if (form.pin.length !== 4 || !/^\d+$/.test(form.pin)) { setError('El PIN debe ser 4 dígitos'); return }
    setSaving(true); setError('')
    const res  = await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...form, role:'DRIVER' }) })
    const data = await res.json()
    if (!data.ok) { setError(data.error); setSaving(false); return }
    setDrivers(d => [...d, data.data])
    setModal(false)
    setForm({ name:'', email:'', phone:'', pin:'', storeId: stores[0]?.id ?? '' })
    setSaving(false)
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/users/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ isActive: !isActive }) })
    setDrivers(d => d.map(dr => dr.id === id ? { ...dr, isActive: !isActive } : dr))
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)', margin:0 }}>Conductores</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{drivers.length} conductor{drivers.length!==1?'es':''} registrado{drivers.length!==1?'s':''}</p>
        </div>
        <button onClick={() => setModal(true)}
          style={{ padding:'9px 18px', background:'var(--accent)', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
          + Nuevo conductor
        </button>
      </div>

      {drivers.length === 0 ? (
        <div style={{ background:'var(--bg-card)', border:'1px dashed var(--border-light)', borderRadius:12, padding:48, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🚚</div>
          <div style={{ fontSize:15, fontWeight:500, color:'var(--text-primary)', marginBottom:6 }}>Sin conductores aún</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:18 }}>Los conductores usan la app móvil con su PIN para gestionar entregas</div>
          <button onClick={() => setModal(true)} style={{ padding:'10px 22px', background:'var(--accent)', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
            Crear primer conductor
          </button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:14 }}>
          {drivers.map(d => {
            const store = stores.find(s => s.id === d.storeId)
            return (
              <div key={d.id} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,#6366F1,#4F46E5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:600, color:'white', flexShrink:0, boxShadow:'0 4px 12px rgba(99,102,241,0.3)' }}>
                      {d.name.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14, color:'var(--text-primary)' }}>{d.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:1 }}>{d.email}</div>
                    </div>
                  </div>
                  <button onClick={() => toggleActive(d.id, d.isActive)}
                    style={{ fontSize:11, padding:'3px 10px', borderRadius:20, cursor:'pointer', border:'none', fontWeight:500,
                      background: d.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                      color:      d.isActive ? '#6EE7B7' : '#9CA3AF',
                    }}>
                    {d.isActive ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', flexDirection:'column', gap:5 }}>
                  {d.phone && <div style={{ fontSize:12, color:'var(--text-muted)' }}>📞 {d.phone}</div>}
                  {store   && <div style={{ fontSize:12, color:'var(--text-muted)' }}>🏪 {store.name}</div>}
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {d.lastLoginAt
                      ? `Último acceso: ${new Date(d.lastLoginAt).toLocaleString('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`
                      : 'Sin accesos registrados'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}
          onClick={e => { if (e.target===e.currentTarget) { setModal(false); setError('') } }}>
          <div style={{ background:'var(--bg-card)', borderRadius:16, padding:28, width:'100%', maxWidth:440, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)', marginBottom:20 }}>Nuevo conductor</div>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#FCA5A5', marginBottom:14 }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Nombre completo *</label>
                <input style={inp} placeholder="Carlos Muñoz" value={form.name} onChange={e=>set('name',e.target.value)}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Email *</label>
                <input type="email" style={inp} placeholder="conductor@empresa.cl" value={form.email} onChange={e=>set('email',e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Teléfono</label>
                <input style={inp} placeholder="+56 9 xxxx xxxx" value={form.phone} onChange={e=>set('phone',e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>PIN (4 dígitos) *</label>
                <input style={inp} type="password" inputMode="numeric" maxLength={4} placeholder="••••" value={form.pin} onChange={e=>set('pin',e.target.value)}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Tienda asignada</label>
                <select style={inp} value={form.storeId} onChange={e=>set('storeId',e.target.value)}>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => { setModal(false); setError('') }}
                style={{ padding:'9px 18px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', cursor:'pointer', color:'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving}
                style={{ padding:'9px 20px', background:saving?'var(--bg-input)':'var(--accent)', color:saving?'var(--text-muted)':'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Creando...' : 'Crear conductor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
