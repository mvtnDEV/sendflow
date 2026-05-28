'use client'
import { useState } from 'react'

type Role = 'SUPER_ADMIN' | 'STORE_ADMIN' | 'DRIVER' | 'VIEWER'

interface UserRow {
  id: string; name: string; email: string; role: Role
  phone: string | null; isActive: boolean
  createdAt: string; lastLoginAt: string | null
  storeId: string | null; store: { id: string; name: string } | null
}
interface Store { id: string; name: string }
interface Props { users: UserRow[]; stores: Store[]; currentUserId: string }

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  STORE_ADMIN: 'Admin Tienda',
  DRIVER:      'Conductor',
  VIEWER:      'Visualizador',
}
const ROLE_COLOR: Record<Role, { bg: string; color: string }> = {
  SUPER_ADMIN: { bg:'rgba(99,102,241,0.1)',  color:'#A5B4FC' },
  STORE_ADMIN: { bg:'rgba(16,185,129,0.1)',  color:'#6EE7B7' },
  DRIVER:      { bg:'rgba(245,158,11,0.1)',  color:'#FCD34D' },
  VIEWER:      { bg:'rgba(139,92,246,0.1)',  color:'#C4B5FD' },
}
const ROLE_DESC: Record<Role, string> = {
  SUPER_ADMIN: 'Acceso total al sistema — ve todas las tiendas, crea usuarios',
  STORE_ADMIN: 'Acceso solo a su tienda asignada — no puede crear usuarios',
  DRIVER:      'Solo accede a la app del conductor con PIN numérico',
  VIEWER:      'Solo puede ver el sistema — no puede crear ni modificar nada',
}

const EMPTY_FORM = { name:'', email:'', password:'', confirmPassword:'', role:'STORE_ADMIN' as Role, storeId:'', phone:'', pin:'' }

export default function UsuariosClient({ users: initial, stores, currentUserId }: Props) {
  const [users,    setUsers]    = useState<UserRow[]>(initial)
  const [modal,    setModal]    = useState<'create'|'edit'|'password'|'delete'|null>(null)
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [filter,   setFilter]   = useState<Role|'ALL'>('ALL')
  const [search,   setSearch]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const filtered = users.filter(u => {
    const matchRole   = filter === 'ALL' || u.role === filter
    const q           = search.toLowerCase()
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    return matchRole && matchSearch
  })

  const counts = {
    ALL:         users.length,
    SUPER_ADMIN: users.filter(u => u.role === 'SUPER_ADMIN').length,
    STORE_ADMIN: users.filter(u => u.role === 'STORE_ADMIN').length,
    DRIVER:      users.filter(u => u.role === 'DRIVER').length,
    VIEWER:      users.filter(u => u.role === 'VIEWER').length,
  }

  function openCreate() { setForm(EMPTY_FORM); setError(''); setModal('create') }
  function openEdit(u: UserRow) {
    setSelected(u)
    setForm({ name:u.name, email:u.email, password:'', confirmPassword:'', role:u.role, storeId:u.storeId||'', phone:u.phone||'', pin:'' })
    setError(''); setModal('edit')
  }
  function openPassword(u: UserRow) { setSelected(u); setForm(f => ({ ...f, password:'', confirmPassword:'', pin:'' })); setError(''); setModal('password') }
  function openDelete(u: UserRow)   { setSelected(u); setModal('delete') }

  function validate(): string | null {
    if (!form.name.trim())  return 'El nombre es requerido'
    if (!form.email.trim()) return 'El email es requerido'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Email inválido'
    if (form.role !== 'DRIVER') {
      if (modal === 'create' && !form.password) return 'La contraseña es requerida'
      if (form.password && form.password.length < 8) return 'Mínimo 8 caracteres'
      if (form.password && form.password !== form.confirmPassword) return 'Las contraseñas no coinciden'
    }
    if (form.role === 'DRIVER') {
      if (modal === 'create' && !form.pin) return 'El PIN es requerido'
      if (form.pin && (form.pin.length !== 4 || !/^\d+$/.test(form.pin))) return 'El PIN debe ser 4 dígitos'
    }
    if (form.role === 'STORE_ADMIN' && !form.storeId) return 'Debes asignar una tienda'
    return null
  }

  async function handleCreate() {
    const err = validate(); if (err) { setError(err); return }
    setSaving(true); setError('')
    const body: any = { name:form.name, email:form.email, role:form.role, phone:form.phone, storeId:form.storeId||null }
    if (form.role === 'DRIVER') body.pin = form.pin
    else body.password = form.password
    const res  = await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    const data = await res.json()
    if (!data.ok) { setError(data.error); setSaving(false); return }
    setUsers(prev => [...prev, data.data]); setModal(null); setSaving(false)
    showSuccess(`Usuario ${form.name} creado`)
  }

  async function handleEdit() {
    if (!selected) return
    const err = validate(); if (err) { setError(err); return }
    setSaving(true); setError('')
    const body: any = { name:form.name, email:form.email, phone:form.phone, storeId:form.storeId||null }
    if (form.role === 'DRIVER' && form.pin) body.pin = form.pin
    const res  = await fetch(`/api/users/${selected.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    const data = await res.json()
    if (!data.ok) { setError(data.error); setSaving(false); return }
    setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, ...body, store:stores.find(s => s.id === body.storeId)||null } : u))
    setModal(null); setSaving(false)
    showSuccess('Cambios guardados')
  }

  async function handlePassword() {
    if (!selected) return
    if (selected.role === 'DRIVER') {
      if (!form.pin || form.pin.length !== 4 || !/^\d+$/.test(form.pin)) { setError('PIN debe ser 4 dígitos'); return }
    } else {
      if (!form.password || form.password.length < 8) { setError('Mínimo 8 caracteres'); return }
      if (form.password !== form.confirmPassword) { setError('Las contraseñas no coinciden'); return }
    }
    setSaving(true); setError('')
    const body = selected.role === 'DRIVER' ? { pin:form.pin } : { password:form.password }
    const res  = await fetch(`/api/users/${selected.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    const data = await res.json()
    if (!data.ok) { setError(data.error); setSaving(false); return }
    setModal(null); setSaving(false)
    showSuccess(selected.role === 'DRIVER' ? 'PIN actualizado' : 'Contraseña actualizada')
  }

  async function handleDelete() {
    if (!selected) return
    setSaving(true)
    const res  = await fetch(`/api/users/${selected.id}`, { method:'DELETE' })
    const data = await res.json()
    if (!data.ok) { alert(data.error); setSaving(false); return }
    setUsers(prev => prev.filter(u => u.id !== selected.id))
    setModal(null); setSaving(false)
    showSuccess(`Usuario ${selected.name} eliminado`)
  }

  async function toggleActive(u: UserRow) {
    if (u.id === currentUserId) { alert('No puedes desactivarte a ti mismo'); return }
    const res  = await fetch(`/api/users/${u.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ isActive: !u.isActive }) })
    const data = await res.json()
    if (!data.ok) { alert(data.error); return }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !x.isActive } : x))
    showSuccess(`Usuario ${u.isActive ? 'desactivado' : 'activado'}`)
  }

  function showSuccess(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  const inp: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', background:'var(--bg-input)', color:'var(--text-primary)' }
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'var(--text-secondary)', display:'block', marginBottom:5 }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)', margin:0 }}>Usuarios</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>Gestiona todos los accesos al sistema y la app del conductor</p>
        </div>
        <button onClick={openCreate}
          style={{ padding:'9px 20px', background:'var(--accent)', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
          + Nuevo usuario
        </button>
      </div>

      {success && (
        <div style={{ background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:8, padding:'10px 16px', fontSize:13, color:'#6EE7B7', fontWeight:500, marginBottom:14 }}>
          ✓ {success}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        {([
          { key:'ALL',         label:`Todos (${counts.ALL})` },
          { key:'SUPER_ADMIN', label:`Super Admin (${counts.SUPER_ADMIN})` },
          { key:'STORE_ADMIN', label:`Admin Tienda (${counts.STORE_ADMIN})` },
          { key:'DRIVER',      label:`Conductores (${counts.DRIVER})` },
          { key:'VIEWER',      label:`Visualizadores (${counts.VIEWER})` },
        ] as {key:Role|'ALL';label:string}[]).map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{ padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', transition:'all .15s',
              border:      filter===t.key ? 'none' : '1px solid var(--border)',
              background:  filter===t.key ? 'var(--accent)' : 'var(--bg-card)',
              color:       filter===t.key ? 'white' : 'var(--text-muted)',
            }}>
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', minWidth:220 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="var(--text-muted)"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o email..."
            style={{ border:'none', outline:'none', fontSize:12, flex:1, fontFamily:'inherit', background:'transparent', color:'var(--text-primary)' }}/>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--text-muted)' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>👤</div>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text-primary)', marginBottom:6 }}>
              {users.length === 0 ? 'Sin usuarios aún' : 'No hay resultados'}
            </div>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg-base)' }}>
                {['Usuario','Email','Rol','Tienda','Estado','Último acceso','Acciones'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--text-muted)', borderBottom:'1px solid var(--border)', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const rc   = ROLE_COLOR[u.role]
                const isMe = u.id === currentUserId
                return (
                  <tr key={u.id} style={{ transition:'background .1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:10, background:rc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:rc.color, flexShrink:0 }}>
                          {u.name.slice(0,2).toUpperCase()}
                        </div>
                        <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>
                          {u.name}
                          {isMe && <span style={{ marginLeft:6, fontSize:10, background:'rgba(99,102,241,0.15)', color:'#A5B4FC', padding:'1px 6px', borderRadius:20 }}>Tú</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--text-muted)' }}>{u.email}</td>
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:500, background:rc.bg, color:rc.color }}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
                      {u.store ? u.store.name : u.role === 'SUPER_ADMIN' ? <span style={{ color:'var(--text-muted)' }}>Todas</span> : '—'}
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:500,
                        background: u.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                        color:      u.isActive ? '#6EE7B7' : '#9CA3AF',
                      }}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString('es-CL', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'America/Santiago' })
                        : 'Nunca'}
                    </td>
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', gap:5 }}>
                        <button onClick={() => openEdit(u)}
                          style={{ padding:'5px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:11, background:'var(--bg-input)', cursor:'pointer', color:'var(--text-secondary)' }}>
                          Editar
                        </button>
                        <button onClick={() => openPassword(u)}
                          style={{ padding:'5px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:11, background:'var(--bg-input)', cursor:'pointer', color:'var(--text-secondary)' }}>
                          {u.role === 'DRIVER' ? 'PIN' : 'Clave'}
                        </button>
                        {!isMe && (
                          <button onClick={() => toggleActive(u)}
                            style={{ padding:'5px 10px', borderRadius:6, fontSize:11, cursor:'pointer', fontWeight:500,
                              border:      u.isActive ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)',
                              background:  u.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                              color:       u.isActive ? '#FCA5A5' : '#6EE7B7',
                            }}>
                            {u.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                        {!isMe && (
                          <button onClick={() => openDelete(u)}
                            style={{ padding:'5px 10px', border:'1px solid rgba(239,68,68,0.3)', borderRadius:6, fontSize:11, background:'rgba(239,68,68,0.1)', cursor:'pointer', color:'#FCA5A5' }}>
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Crear/Editar */}
      {(modal === 'create' || modal === 'edit') && (
        <DarkModal title={modal==='create' ? 'Nuevo usuario' : `Editar: ${selected?.name}`} onClose={() => setModal(null)}>
          {error && <ErrBox msg={error}/>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Nombre completo *</label>
              <input style={inp} placeholder="Ej: María González" value={form.name} onChange={e=>set('name',e.target.value)}/>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Email *</label>
              <input type="email" style={inp} placeholder="usuario@empresa.cl" value={form.email} onChange={e=>set('email',e.target.value)}/>
            </div>
            {modal === 'create' && (
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Rol *</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {(['SUPER_ADMIN','STORE_ADMIN','VIEWER','DRIVER'] as Role[]).map(r => {
                    const rc = ROLE_COLOR[r]
                    return (
                      <div key={r} onClick={()=>set('role',r)}
                        style={{ padding:'10px 12px', borderRadius:10, cursor:'pointer', transition:'all .15s',
                          border:`1.5px solid ${form.role===r ? rc.color : 'var(--border)'}`,
                          background: form.role===r ? rc.bg : 'var(--bg-input)' }}>
                        <div style={{ fontSize:12, fontWeight:600, color:form.role===r?rc.color:'var(--text-secondary)', marginBottom:3 }}>{ROLE_LABEL[r]}</div>
                        <div style={{ fontSize:10, color:'var(--text-muted)', lineHeight:1.4 }}>{ROLE_DESC[r]}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {(form.role === 'STORE_ADMIN' || form.role === 'DRIVER' || form.role === 'VIEWER') && (
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Tienda asignada {form.role==='STORE_ADMIN'?'*':''}</label>
                <select style={inp} value={form.storeId} onChange={e=>set('storeId',e.target.value)}>
                  <option value="">— Sin tienda —</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Teléfono</label>
              <input style={inp} placeholder="+56 9 xxxx xxxx" value={form.phone} onChange={e=>set('phone',e.target.value)}/>
            </div>
            {form.role !== 'DRIVER' && modal === 'create' && (<>
              <div>
                <label style={lbl}>Contraseña *</label>
                <input type="password" style={inp} placeholder="••••••••" value={form.password} onChange={e=>set('password',e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Confirmar *</label>
                <input type="password" style={inp} placeholder="••••••••" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)}/>
              </div>
            </>)}
            {form.role === 'DRIVER' && (
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>PIN * <span style={{ fontSize:10, color:'var(--text-muted)', fontWeight:400 }}>4 dígitos</span></label>
                <input style={{ ...inp, letterSpacing:'0.3em', fontSize:18, textAlign:'center', maxWidth:140 }}
                  type="password" inputMode="numeric" maxLength={4} placeholder="••••"
                  value={form.pin} onChange={e=>set('pin',e.target.value.replace(/\D/g,''))}/>
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button onClick={() => setModal(null)}
              style={{ padding:'10px 18px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', cursor:'pointer', color:'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button onClick={modal==='create'?handleCreate:handleEdit} disabled={saving}
              style={{ padding:'10px 24px', background:saving?'var(--bg-input)':'var(--accent)', color:saving?'var(--text-muted)':'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
              {saving ? 'Guardando...' : modal==='create' ? 'Crear usuario' : 'Guardar cambios'}
            </button>
          </div>
        </DarkModal>
      )}

      {/* Modal PIN/Contraseña */}
      {modal === 'password' && selected && (
        <DarkModal title={selected.role==='DRIVER' ? `PIN — ${selected.name}` : `Contraseña — ${selected.name}`} onClose={() => setModal(null)}>
          {error && <ErrBox msg={error}/>}
          {selected.role === 'DRIVER' ? (
            <div>
              <label style={lbl}>Nuevo PIN <span style={{ fontSize:10, color:'var(--text-muted)' }}>(4 dígitos)</span></label>
              <input style={{ ...inp, letterSpacing:'0.3em', fontSize:18, textAlign:'center', maxWidth:140 }}
                type="password" inputMode="numeric" maxLength={4} placeholder="••••"
                value={form.pin} onChange={e=>set('pin',e.target.value.replace(/\D/g,''))}/>
            </div>
          ) : (
            <div style={{ display:'grid', gap:12 }}>
              <div>
                <label style={lbl}>Nueva contraseña</label>
                <input type="password" style={inp} placeholder="••••••••" value={form.password} onChange={e=>set('password',e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Confirmar</label>
                <input type="password" style={inp} placeholder="••••••••" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)}/>
              </div>
            </div>
          )}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button onClick={() => setModal(null)}
              style={{ padding:'10px 18px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', cursor:'pointer', color:'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button onClick={handlePassword} disabled={saving}
              style={{ padding:'10px 24px', background:saving?'var(--bg-input)':'var(--accent)', color:saving?'var(--text-muted)':'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </DarkModal>
      )}

      {/* Modal Eliminar */}
      {modal === 'delete' && selected && (
        <DarkModal title="Eliminar usuario" onClose={() => setModal(null)}>
          <div style={{ textAlign:'center', padding:'10px 0 20px' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🗑️</div>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text-primary)', marginBottom:8 }}>¿Eliminar a {selected.name}?</div>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:6 }}>Esta acción es <strong style={{ color:'#FCA5A5' }}>permanente</strong> y no se puede deshacer.</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{selected.email} · {ROLE_LABEL[selected.role]}</div>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setModal(null)}
              style={{ flex:1, padding:'10px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', cursor:'pointer', color:'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={saving}
              style={{ flex:1, padding:'10px', background:saving?'var(--bg-input)':'rgba(239,68,68,0.2)', color:saving?'var(--text-muted)':'#FCA5A5', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
              {saving ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </DarkModal>
      )}
    </div>
  )
}

function DarkModal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'var(--bg-card)', borderRadius:16, padding:28, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', border:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:17, fontWeight:600, color:'var(--text-primary)' }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text-muted)', lineHeight:1, padding:4 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ErrBox({ msg }: { msg:string }) {
  return (
    <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#FCA5A5', marginBottom:16 }}>
      ⚠ {msg}
    </div>
  )
}
