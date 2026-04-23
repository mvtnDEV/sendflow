'use client'
import { useState } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Role = 'SUPER_ADMIN' | 'STORE_ADMIN' | 'DRIVER'

interface UserRow {
  id: string; name: string; email: string; role: Role
  phone: string | null; isActive: boolean
  createdAt: string; lastLoginAt: string | null
  storeId: string | null; store: { id: string; name: string } | null
}
interface Store { id: string; name: string }

interface Props {
  users:         UserRow[]
  stores:        Store[]
  currentUserId: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  STORE_ADMIN: 'Admin Tienda',
  DRIVER:      'Conductor',
}
const ROLE_COLOR: Record<Role, { bg: string; color: string }> = {
  SUPER_ADMIN: { bg:'#EFF6FF', color:'#1D4ED8' },
  STORE_ADMIN: { bg:'#F0FDF4', color:'#166534' },
  DRIVER:      { bg:'#FFF7ED', color:'#C2410C' },
}
const ROLE_DESC: Record<Role, string> = {
  SUPER_ADMIN: 'Acceso total al sistema — ve todas las tiendas, crea usuarios',
  STORE_ADMIN: 'Acceso solo a su tienda asignada — no puede crear usuarios',
  DRIVER:      'Solo accede a la app del conductor con PIN numérico',
}

const EMPTY_FORM = { name:'', email:'', password:'', confirmPassword:'', role:'STORE_ADMIN' as Role, storeId:'', phone:'', pin:'' }

// ─── Componente principal ─────────────────────────────────────────────────────

export default function UsuariosClient({ users: initial, stores, currentUserId }: Props) {
  const [users,   setUsers]   = useState<UserRow[]>(initial)
  const [modal,   setModal]   = useState<'create'|'edit'|'password'|null>(null)
  const [selected,setSelected]= useState<UserRow | null>(null)
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [filter,  setFilter]  = useState<Role|'ALL'>('ALL')
  const [search,  setSearch]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ─── Filtros ──────────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const matchRole   = filter === 'ALL' || u.role === filter
    const q = search.toLowerCase()
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    return matchRole && matchSearch
  })

  const counts = {
    ALL:         users.length,
    SUPER_ADMIN: users.filter(u => u.role === 'SUPER_ADMIN').length,
    STORE_ADMIN: users.filter(u => u.role === 'STORE_ADMIN').length,
    DRIVER:      users.filter(u => u.role === 'DRIVER').length,
  }

  // ─── Abrir modales ────────────────────────────────────────────────────────

  function openCreate() {
    setForm(EMPTY_FORM)
    setError('')
    setModal('create')
  }

  function openEdit(u: UserRow) {
    setSelected(u)
    setForm({ name:u.name, email:u.email, password:'', confirmPassword:'', role:u.role, storeId:u.storeId||'', phone:u.phone||'', pin:'' })
    setError('')
    setModal('edit')
  }

  function openPassword(u: UserRow) {
    setSelected(u)
    setForm(f => ({ ...f, password:'', confirmPassword:'', pin:'' }))
    setError('')
    setModal('password')
  }

  // ─── Validaciones ─────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!form.name.trim())  return 'El nombre es requerido'
    if (!form.email.trim()) return 'El email es requerido'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Email inválido'
    if (form.role !== 'DRIVER') {
      if (modal === 'create' && !form.password) return 'La contraseña es requerida'
      if (form.password && form.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
      if (form.password && form.password !== form.confirmPassword) return 'Las contraseñas no coinciden'
    }
    if (form.role === 'DRIVER') {
      if (modal === 'create' && !form.pin) return 'El PIN es requerido para conductores'
      if (form.pin && (form.pin.length !== 4 || !/^\d+$/.test(form.pin))) return 'El PIN debe ser exactamente 4 dígitos numéricos'
    }
    if (form.role === 'STORE_ADMIN' && !form.storeId) return 'Debes asignar una tienda al Admin de Tienda'
    return null
  }

  // ─── Crear usuario ────────────────────────────────────────────────────────

  async function handleCreate() {
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true); setError('')

    const body: any = { name:form.name, email:form.email, role:form.role, phone:form.phone, storeId:form.storeId||null }
    if (form.role === 'DRIVER') body.pin = form.pin
    else body.password = form.password

    const res  = await fetch('/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    const data = await res.json()

    if (!data.ok) { setError(data.error); setSaving(false); return }

    setUsers(prev => [...prev, data.data])
    setModal(null)
    setSaving(false)
    showSuccess(`Usuario ${form.name} creado correctamente`)
  }

  // ─── Editar usuario ───────────────────────────────────────────────────────

  async function handleEdit() {
    if (!selected) return
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true); setError('')

    const body: any = { name:form.name, email:form.email, phone:form.phone, storeId:form.storeId||null }
    if (form.role === 'DRIVER' && form.pin) body.pin = form.pin

    const res  = await fetch(`/api/users/${selected.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    const data = await res.json()

    if (!data.ok) { setError(data.error); setSaving(false); return }

    setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, ...body, store: stores.find(s => s.id === body.storeId) || null } : u))
    setModal(null)
    setSaving(false)
    showSuccess('Cambios guardados correctamente')
  }

  // ─── Cambiar contraseña ───────────────────────────────────────────────────

  async function handlePassword() {
    if (!selected) return
    if (selected.role === 'DRIVER') {
      if (!form.pin || form.pin.length !== 4 || !/^\d+$/.test(form.pin)) { setError('PIN debe ser 4 dígitos'); return }
    } else {
      if (!form.password || form.password.length < 8) { setError('Mínimo 8 caracteres'); return }
      if (form.password !== form.confirmPassword) { setError('Las contraseñas no coinciden'); return }
    }
    setSaving(true); setError('')

    const body = selected.role === 'DRIVER' ? { pin: form.pin } : { password: form.password }
    const res  = await fetch(`/api/users/${selected.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    const data = await res.json()

    if (!data.ok) { setError(data.error); setSaving(false); return }
    setModal(null); setSaving(false)
    showSuccess(selected.role === 'DRIVER' ? 'PIN actualizado' : 'Contraseña actualizada')
  }

  // ─── Activar/desactivar ───────────────────────────────────────────────────

  async function toggleActive(u: UserRow) {
    if (u.id === currentUserId) { alert('No puedes desactivarte a ti mismo'); return }
    const action = u.isActive ? 'desactivar' : 'activar'
    if (!confirm(`¿${action.charAt(0).toUpperCase()+action.slice(1)} a ${u.name}?`)) return

    const res  = await fetch(`/api/users/${u.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ isActive: !u.isActive }) })
    const data = await res.json()
    if (!data.ok) { alert(data.error); return }

    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !x.isActive } : x))
    showSuccess(`Usuario ${u.isActive ? 'desactivado' : 'activado'}`)
  }

  function showSuccess(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3000)
  }

  // ─── Estilos reutilizables ────────────────────────────────────────────────

  const inp: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', transition:'border-color .15s' }
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:500 }}>Usuarios</h1>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:3 }}>
            Gestiona todos los accesos al sistema y la app del conductor
          </p>
        </div>
        <button onClick={openCreate}
          style={{ padding:'9px 20px', background:'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          + Nuevo usuario
        </button>
      </div>

      {/* Toast success */}
      {success && (
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'10px 16px', fontSize:13, color:'#166534', fontWeight:500, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
          ✓ {success}
        </div>
      )}

      {/* Tabs por rol */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {([
          { key:'ALL',         label:`Todos (${counts.ALL})` },
          { key:'SUPER_ADMIN', label:`Super Admin (${counts.SUPER_ADMIN})` },
          { key:'STORE_ADMIN', label:`Admin Tienda (${counts.STORE_ADMIN})` },
          { key:'DRIVER',      label:`Conductores (${counts.DRIVER})` },
        ] as {key:Role|'ALL';label:string}[]).map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{ padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer',
              border: filter===t.key ? 'none' : '1px solid #E2E8F0',
              background: filter===t.key ? '#0B1628' : 'white',
              color:       filter===t.key ? 'white'   : '#6B7280',
            }}>
            {t.label}
          </button>
        ))}

        {/* Buscador */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, background:'white', border:'1px solid #E2E8F0', borderRadius:8, padding:'6px 12px', minWidth:220 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="#9CA3AF"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o email..."
            style={{ border:'none', outline:'none', fontSize:12, flex:1, fontFamily:'inherit' }}/>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'#9CA3AF' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>👤</div>
            <div style={{ fontSize:15, fontWeight:500, color:'#374151', marginBottom:6 }}>
              {users.length === 0 ? 'Sin usuarios aún' : 'No hay resultados'}
            </div>
            <div style={{ fontSize:13, marginBottom:18 }}>
              {users.length === 0 ? 'Crea el primer usuario del sistema' : 'Prueba cambiando el filtro'}
            </div>
            {users.length === 0 && (
              <button onClick={openCreate}
                style={{ padding:'9px 20px', background:'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
                + Crear primer usuario
              </button>
            )}
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#F8FAFC' }}>
                {['Usuario','Email','Rol','Tienda','Teléfono','Estado','Último acceso','Acciones'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const rc = ROLE_COLOR[u.role]
                const isMe = u.id === currentUserId
                return (
                  <tr key={u.id}
                    onMouseOver={e => (e.currentTarget.style.background = '#FAFCFF')}
                    onMouseOut={e  => (e.currentTarget.style.background = '')}>
                    {/* Usuario */}
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:'50%', background:rc.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:rc.color, flexShrink:0 }}>
                          {u.name.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500 }}>
                            {u.name}
                            {isMe && <span style={{ marginLeft:6, fontSize:10, background:'#EFF6FF', color:'#1D4ED8', padding:'1px 6px', borderRadius:20 }}>Tú</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Email */}
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, color:'#6B7280' }}>{u.email}</td>
                    {/* Rol */}
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9' }}>
                      <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:500, background:rc.bg, color:rc.color }}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    {/* Tienda */}
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>
                      {u.store ? u.store.name : u.role === 'SUPER_ADMIN' ? <span style={{ color:'#9CA3AF' }}>Todas</span> : '—'}
                    </td>
                    {/* Teléfono */}
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>
                      {u.phone || '—'}
                    </td>
                    {/* Estado */}
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9' }}>
                      <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:500,
                        background: u.isActive ? '#F0FDF4' : '#F1F5F9',
                        color:      u.isActive ? '#166534' : '#6B7280',
                      }}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {/* Último acceso */}
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#9CA3AF', whiteSpace:'nowrap' }}>
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString('es-CL', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
                        : 'Nunca'}
                    </td>
                    {/* Acciones */}
                    <td style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9' }}>
                      <div style={{ display:'flex', gap:5 }}>
                        <button onClick={() => openEdit(u)} title="Editar"
                          style={{ padding:'5px 10px', border:'1px solid #E2E8F0', borderRadius:6, fontSize:11, background:'white', cursor:'pointer', color:'#374151' }}>
                          Editar
                        </button>
                        <button onClick={() => openPassword(u)} title={u.role==='DRIVER'?'Cambiar PIN':'Cambiar contraseña'}
                          style={{ padding:'5px 10px', border:'1px solid #E2E8F0', borderRadius:6, fontSize:11, background:'white', cursor:'pointer', color:'#374151' }}>
                          {u.role === 'DRIVER' ? 'PIN' : 'Clave'}
                        </button>
                        {!isMe && (
                          <button onClick={() => toggleActive(u)}
                            style={{ padding:'5px 10px', border:`1px solid ${u.isActive?'#FECDD3':'#BBF7D0'}`, borderRadius:6, fontSize:11, background:u.isActive?'#FFF1F2':'#F0FDF4', cursor:'pointer', color:u.isActive?'#9F1239':'#166534' }}>
                            {u.isActive ? 'Desactivar' : 'Activar'}
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

      {/* ─── Modal Crear / Editar ──────────────────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal==='create' ? 'Nuevo usuario' : `Editar: ${selected?.name}`} onClose={() => setModal(null)}>

          {error && <ErrorBox msg={error}/>}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

            {/* Nombre */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Nombre completo *</label>
              <input style={inp} placeholder="Ej: María González" value={form.name} onChange={e=>set('name',e.target.value)}/>
            </div>

            {/* Email */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Email *</label>
              <input type="email" style={inp} placeholder="usuario@empresa.cl" value={form.email} onChange={e=>set('email',e.target.value)}/>
            </div>

            {/* Rol — solo en creación */}
            {modal === 'create' && (
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Rol *</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {(['SUPER_ADMIN','STORE_ADMIN','DRIVER'] as Role[]).map(r => {
                    const rc = ROLE_COLOR[r]
                    return (
                      <div key={r} onClick={()=>set('role',r)}
                        style={{ padding:'10px 12px', borderRadius:10, cursor:'pointer', border:`1.5px solid ${form.role===r ? rc.color : '#E2E8F0'}`, background:form.role===r ? rc.bg : 'white', transition:'all .1s' }}>
                        <div style={{ fontSize:12, fontWeight:600, color:form.role===r?rc.color:'#374151', marginBottom:3 }}>{ROLE_LABEL[r]}</div>
                        <div style={{ fontSize:10, color:'#9CA3AF', lineHeight:1.4 }}>{ROLE_DESC[r]}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tienda — solo para STORE_ADMIN y DRIVER */}
            {(form.role === 'STORE_ADMIN' || form.role === 'DRIVER') && (
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Tienda asignada {form.role==='STORE_ADMIN'?'*':''}</label>
                <select style={inp} value={form.storeId} onChange={e=>set('storeId',e.target.value)}>
                  <option value="">— Sin tienda asignada —</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {stores.length === 0 && (
                  <div style={{ fontSize:11, color:'#D97706', marginTop:4 }}>
                    ⚠ No hay tiendas creadas. <a href="/tiendas" style={{ color:'#2563EB' }}>Crea una primero</a>
                  </div>
                )}
              </div>
            )}

            {/* Teléfono */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Teléfono</label>
              <input style={inp} placeholder="+56 9 xxxx xxxx" value={form.phone} onChange={e=>set('phone',e.target.value)}/>
            </div>

            {/* Contraseña — para SUPER_ADMIN y STORE_ADMIN */}
            {form.role !== 'DRIVER' && modal === 'create' && (
              <>
                <div>
                  <label style={lbl}>Contraseña * <span style={{ fontSize:10, color:'#9CA3AF', fontWeight:400 }}>(mín. 8 caracteres)</span></label>
                  <input type="password" style={inp} placeholder="••••••••" value={form.password} onChange={e=>set('password',e.target.value)}/>
                </div>
                <div>
                  <label style={lbl}>Confirmar contraseña *</label>
                  <input type="password" style={inp} placeholder="••••••••" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)}/>
                </div>
              </>
            )}

            {/* PIN — para DRIVER */}
            {form.role === 'DRIVER' && (
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>
                  PIN del conductor *
                  <span style={{ fontSize:10, color:'#9CA3AF', fontWeight:400, marginLeft:4 }}>4 dígitos numéricos</span>
                </label>
                <input style={{ ...inp, letterSpacing:'0.3em', fontSize:18, textAlign:'center', maxWidth:140 }}
                  type="password" inputMode="numeric" maxLength={4} placeholder="••••"
                  value={form.pin} onChange={e=>set('pin',e.target.value.replace(/\D/g,''))}/>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:5 }}>
                  El conductor usa este PIN para entrar a la app móvil
                </div>
              </div>
            )}
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button onClick={() => setModal(null)}
              style={{ padding:'10px 18px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', cursor:'pointer' }}>
              Cancelar
            </button>
            <button onClick={modal==='create'?handleCreate:handleEdit} disabled={saving}
              style={{ padding:'10px 24px', background:saving?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
              {saving ? 'Guardando...' : modal==='create' ? 'Crear usuario' : 'Guardar cambios'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Modal Cambiar contraseña / PIN ──────────────────────────────── */}
      {modal === 'password' && selected && (
        <Modal title={selected.role==='DRIVER' ? `Cambiar PIN — ${selected.name}` : `Cambiar contraseña — ${selected.name}`} onClose={() => setModal(null)}>

          {error && <ErrorBox msg={error}/>}

          {selected.role === 'DRIVER' ? (
            <div>
              <label style={lbl}>Nuevo PIN <span style={{ fontSize:10, color:'#9CA3AF', fontWeight:400 }}>(4 dígitos)</span></label>
              <input style={{ ...inp, letterSpacing:'0.3em', fontSize:18, textAlign:'center', maxWidth:140 }}
                type="password" inputMode="numeric" maxLength={4} placeholder="••••"
                value={form.pin} onChange={e=>set('pin',e.target.value.replace(/\D/g,''))}/>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12 }}>
              <div>
                <label style={lbl}>Nueva contraseña <span style={{ fontSize:10, color:'#9CA3AF', fontWeight:400 }}>(mín. 8 caracteres)</span></label>
                <input type="password" style={inp} placeholder="••••••••" value={form.password} onChange={e=>set('password',e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Confirmar nueva contraseña</label>
                <input type="password" style={inp} placeholder="••••••••" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)}/>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button onClick={() => setModal(null)}
              style={{ padding:'10px 18px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', cursor:'pointer' }}>
              Cancelar
            </button>
            <button onClick={handlePassword} disabled={saving}
              style={{ padding:'10px 24px', background:saving?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
              {saving ? 'Guardando...' : selected.role==='DRIVER' ? 'Cambiar PIN' : 'Cambiar contraseña'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'white', borderRadius:16, padding:28, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:17, fontWeight:600 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#9CA3AF', lineHeight:1, padding:4 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ background:'#FFF1F2', border:'1px solid #FECDD3', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#9F1239', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
      ⚠ {msg}
    </div>
  )
}
