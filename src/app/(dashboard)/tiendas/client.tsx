'use client'
import { useState } from 'react'

const PLATFORM_COLOR: Record<string, { bg: string; color: string }> = {
  SHOPIFY:      { bg:'rgba(99,102,241,0.1)',  color:'#A5B4FC' },
  MERCADOLIBRE: { bg:'rgba(245,158,11,0.1)',  color:'#FCD34D' },
  WOOCOMMERCE:  { bg:'rgba(139,92,246,0.1)',  color:'#C4B5FD' },
  JUMPSELLER:   { bg:'rgba(245,158,11,0.1)',  color:'#FCD34D' },
  MANUAL:       { bg:'rgba(107,114,128,0.1)', color:'#9CA3AF' },
}

const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', background:'var(--bg-input)', color:'var(--text-primary)' }
const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'var(--text-secondary)', display:'block', marginBottom:5 }

function fmt(n: any) {
  if (!n) return null
  return `$${Number(n).toLocaleString('es-CL')}`
}

export default function TiendasClient({ stores: initial, isSuperAdmin, platformLabel }: any) {
  const [stores,    setStores]    = useState(initial)
  const [modal,     setModal]     = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [form,      setForm]      = useState({ name:'', email:'', phone:'', rut:'' })
  const [editForm,  setEditForm]  = useState<any>(null)

  const set     = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setEdit = (k: string, v: string) => setEditForm((f: any) => ({ ...f, [k]: v }))

  function openEdit(store: any) {
    setEditForm({
      id:                store.id,
      name:              store.name              || '',
      email:             store.email             || '',
      phone:             store.phone             || '',
      rut:               store.rut               || '',
      encargado:         store.encargado         || '',
      addressRetiro:     store.addressRetiro     || '',
      tarifaUrbana:      store.tarifaUrbana      ? String(store.tarifaUrbana)      : '',
      tarifaExtraUrbana: store.tarifaExtraUrbana ? String(store.tarifaExtraUrbana) : '',
      tarifaRural:       store.tarifaRural       ? String(store.tarifaRural)       : '',
      tarifaRetiro:      store.tarifaRetiro      ? String(store.tarifaRetiro)      : '',
      fechaTarifa:       store.fechaTarifa       || '',
    })
    setError('')
    setEditModal(true)
  }

  async function handleCreate() {
    if (!form.name) { setError('El nombre es requerido'); return }
    setSaving(true); setError('')
    try {
      const slug = form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const res  = await fetch('/api/stores', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, slug }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Error creando tienda'); return }
      setStores((s: any) => [...s, { ...data.data, integrations:[], _count:{ orders:0 } }])
      setModal(false)
      setForm({ name:'', email:'', phone:'', rut:'' })
    } catch { setError('Error de conexión') }
    finally { setSaving(false) }
  }

  async function handleEdit() {
    if (!editForm.name) { setError('El nombre es requerido'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/stores/${editForm.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          name:              editForm.name,
          email:             editForm.email             || null,
          phone:             editForm.phone             || null,
          rut:               editForm.rut               || null,
          encargado:         editForm.encargado         || null,
          addressRetiro:     editForm.addressRetiro     || null,
          tarifaUrbana:      editForm.tarifaUrbana      ? parseFloat(editForm.tarifaUrbana)      : null,
          tarifaExtraUrbana: editForm.tarifaExtraUrbana ? parseFloat(editForm.tarifaExtraUrbana) : null,
          tarifaRural:       editForm.tarifaRural       ? parseFloat(editForm.tarifaRural)       : null,
          tarifaRetiro:      editForm.tarifaRetiro      ? parseFloat(editForm.tarifaRetiro)      : null,
          fechaTarifa:       editForm.fechaTarifa       || null,
        }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Error actualizando tienda'); return }
      setStores((s: any) => s.map((st: any) => st.id === editForm.id ? { ...st, ...data.data } : st))
      setEditModal(false)
    } catch { setError('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)', margin:0 }}>Tiendas conectadas</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{stores.length} tienda{stores.length!==1?'s':''} registrada{stores.length!==1?'s':''}</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setModal(true)}
            style={{ padding:'8px 16px', background:'var(--accent)', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + Nueva tienda
          </button>
        )}
      </div>

      {stores.length === 0 ? (
        <div style={{ background:'var(--bg-card)', border:'1px dashed var(--border-light)', borderRadius:12, padding:48, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏪</div>
          <div style={{ fontSize:15, fontWeight:500, color:'var(--text-primary)', marginBottom:6 }}>Sin tiendas aún</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:18 }}>Crea tu primera tienda para empezar</div>
          {isSuperAdmin && (
            <button onClick={() => setModal(true)}
              style={{ padding:'10px 22px', background:'var(--accent)', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
              + Crear primera tienda
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:14 }}>
          {stores.map((store: any) => (
            <div key={store.id} style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:15, color:'var(--text-primary)' }}>{store.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{store._count.orders} pedidos totales</div>
                  {store.email         && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>✉ {store.email}</div>}
                  {store.phone         && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>📞 {store.phone}</div>}
                  {store.rut           && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>RUT: {store.rut}</div>}
                  {store.encargado     && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>👤 {store.encargado}</div>}
                  {store.addressRetiro && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>📍 {store.addressRetiro}</div>}
                  {isSuperAdmin && store.fechaTarifa && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>Tarifa vigente: {store.fechaTarifa}</div>}
                  {isSuperAdmin && (store.tarifaUrbana || store.tarifaExtraUrbana || store.tarifaRural || store.tarifaRetiro) && (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                      {store.tarifaUrbana      && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(99,102,241,0.1)', color:'#A5B4FC', fontWeight:500 }}>Urbana {fmt(store.tarifaUrbana)}</span>}
                      {store.tarifaExtraUrbana && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(245,158,11,0.1)', color:'#FCD34D', fontWeight:500 }}>Extra {fmt(store.tarifaExtraUrbana)}</span>}
                      {store.tarifaRural       && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(16,185,129,0.1)', color:'#6EE7B7', fontWeight:500 }}>Rural {fmt(store.tarifaRural)}</span>}
                      {store.tarifaRetiro      && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(139,92,246,0.1)', color:'#C4B5FD', fontWeight:500 }}>Retiro {fmt(store.tarifaRetiro)}</span>}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                  <span style={{ fontSize:11, padding:'3px 9px', borderRadius:20, background:'rgba(16,185,129,0.1)', color:'#6EE7B7', fontWeight:500 }}>
                    {store.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                  {isSuperAdmin && (
                    <button onClick={() => openEdit(store)}
                      style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-secondary)', cursor:'pointer' }}>
                      ✏ Editar
                    </button>
                  )}
                </div>
              </div>
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
                <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600 }}>Integraciones</div>
                {store.integrations.length === 0 ? (
                  <div style={{ fontSize:13, color:'var(--text-muted)' }}>Sin integraciones configuradas</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {store.integrations.map((int: any) => {
                      const pc = PLATFORM_COLOR[int.platform] ?? { bg:'rgba(107,114,128,0.1)', color:'#9CA3AF' }
                      return (
                        <div key={int.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <span style={{ padding:'3px 9px', borderRadius:6, fontSize:12, fontWeight:500, background:pc.bg, color:pc.color }}>
                            {platformLabel[int.platform] ?? int.platform}
                          </span>
                          <span style={{ fontSize:11, color:int.isActive?'#6EE7B7':'var(--text-muted)' }}>
                            {int.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}
          onClick={e => { if (e.target===e.currentTarget) setModal(false) }}>
          <div style={{ background:'var(--bg-card)', borderRadius:16, padding:28, width:'100%', maxWidth:440, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)', marginBottom:20 }}>Nueva tienda</div>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#FCA5A5', marginBottom:14 }}>{error}</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
              <div><label style={lbl}>Nombre *</label><input style={inp} placeholder="Mi Tienda Online" value={form.name} onChange={e => set('name', e.target.value)}/></div>
              <div><label style={lbl}>Email</label><input type="email" style={inp} placeholder="tienda@email.com" value={form.email} onChange={e => set('email', e.target.value)}/></div>
              <div><label style={lbl}>Teléfono</label><input style={inp} placeholder="+56 9 xxxx xxxx" value={form.phone} onChange={e => set('phone', e.target.value)}/></div>
              <div><label style={lbl}>RUT empresa</label><input style={inp} placeholder="12.345.678-9" value={form.rut} onChange={e => set('rut', e.target.value)}/></div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => { setModal(false); setError('') }} style={{ padding:'9px 18px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', cursor:'pointer', color:'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleCreate} disabled={saving} style={{ padding:'9px 20px', background:saving?'var(--bg-input)':'var(--accent)', color:saving?'var(--text-muted)':'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Creando...' : 'Crear tienda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {editModal && editForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}
          onClick={e => { if (e.target===e.currentTarget) setEditModal(false) }}>
          <div style={{ background:'var(--bg-card)', borderRadius:16, padding:28, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto', border:'1px solid var(--border)' }}>
            <div style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)', marginBottom:4 }}>Editar tienda</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:20 }}>{editForm.name}</div>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#FCA5A5', marginBottom:14 }}>{error}</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
              <div style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid var(--border)', paddingBottom:6 }}>Datos generales</div>
              <div><label style={lbl}>Nombre *</label><input style={inp} value={editForm.name} onChange={e => setEdit('name', e.target.value)}/></div>
              <div><label style={lbl}>Email</label><input type="email" style={inp} placeholder="tienda@email.com" value={editForm.email} onChange={e => setEdit('email', e.target.value)}/></div>
              <div><label style={lbl}>Teléfono</label><input style={inp} placeholder="+56 9 xxxx xxxx" value={editForm.phone} onChange={e => setEdit('phone', e.target.value)}/></div>
              <div><label style={lbl}>RUT empresa</label><input style={inp} placeholder="12.345.678-9" value={editForm.rut} onChange={e => setEdit('rut', e.target.value)}/></div>
              <div style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid var(--border)', paddingBottom:6, marginTop:8 }}>Datos operacionales</div>
              <div><label style={lbl}>Nombre encargado</label><input style={inp} placeholder="Juan Pérez" value={editForm.encargado} onChange={e => setEdit('encargado', e.target.value)}/></div>
              <div><label style={lbl}>Dirección de retiro</label><input style={inp} placeholder="Av. Providencia 1234" value={editForm.addressRetiro} onChange={e => setEdit('addressRetiro', e.target.value)}/></div>
              <div style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid var(--border)', paddingBottom:6, marginTop:8 }}>Tarifas (CLP)</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div><label style={lbl}>Tarifa Urbana</label><input type="number" style={inp} placeholder="2790" value={editForm.tarifaUrbana} onChange={e => setEdit('tarifaUrbana', e.target.value)}/></div>
                <div><label style={lbl}>Tarifa Extra Urbana</label><input type="number" style={inp} placeholder="3790" value={editForm.tarifaExtraUrbana} onChange={e => setEdit('tarifaExtraUrbana', e.target.value)}/></div>
                <div><label style={lbl}>Tarifa Rural</label><input type="number" style={inp} placeholder="3990" value={editForm.tarifaRural} onChange={e => setEdit('tarifaRural', e.target.value)}/></div>
                <div><label style={lbl}>Tarifa Retiro</label><input type="number" style={inp} placeholder="3000" value={editForm.tarifaRetiro} onChange={e => setEdit('tarifaRetiro', e.target.value)}/></div>
              </div>
              <div><label style={lbl}>Fecha vigencia tarifa</label><input style={inp} placeholder="abril 2026" value={editForm.fechaTarifa} onChange={e => setEdit('fechaTarifa', e.target.value)}/></div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => { setEditModal(false); setError('') }} style={{ padding:'9px 18px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', cursor:'pointer', color:'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleEdit} disabled={saving} style={{ padding:'9px 20px', background:saving?'var(--bg-input)':'var(--accent)', color:saving?'var(--text-muted)':'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
