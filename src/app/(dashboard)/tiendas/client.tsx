'use client'
import { useState } from 'react'

const PLATFORM_COLOR: Record<string, { bg: string; color: string }> = {
  SHOPIFY:      { bg: '#EFF6FF', color: '#1D4ED8' },
  MERCADOLIBRE: { bg: '#FFF7ED', color: '#C2410C' },
  WOOCOMMERCE:  { bg: '#F5F3FF', color: '#5B21B6' },
  JUMPSELLER:   { bg: '#FFF7ED', color: '#92400E' },
  MANUAL:       { bg: '#F1F5F9', color: '#475569' },
}

export default function TiendasClient({ stores: initial, isSuperAdmin, platformLabel }: any) {
  const [stores, setStores]   = useState(initial)
  const [modal, setModal]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({ name: '', email: '', phone: '', rut: '' })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleCreate() {
    if (!form.name) { setError('El nombre es requerido'); return }
    setSaving(true); setError('')
    try {
      const slug = form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, slug }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Error creando tienda'); return }
      setStores((s: any) => [...s, { ...data.data, integrations: [], _count: { orders: 0 } }])
      setModal(false)
      setForm({ name: '', email: '', phone: '', rut: '' })
    } catch { setError('Error de conexión') }
    finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 5 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Tiendas conectadas</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>{stores.length} tienda{stores.length !== 1 ? 's' : ''} registrada{stores.length !== 1 ? 's' : ''}</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setModal(true)}
            style={{ padding: '8px 16px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + Nueva tienda
          </button>
        )}
      </div>

      {stores.length === 0 ? (
        <div style={{ background: 'white', border: '2px dashed #E2E8F0', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Sin tiendas aún</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 18 }}>Crea tu primera tienda para empezar</div>
          {isSuperAdmin && (
            <button onClick={() => setModal(true)}
              style={{ padding: '10px 22px', background: '#2563EB', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              + Crear primera tienda
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
          {stores.map((store: any) => (
            <div key={store.id} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 15 }}>{store.name}</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{store._count.orders} pedidos totales</div>
                  {store.email && <div style={{ fontSize: 12, color: '#6B7280' }}>{store.email}</div>}
                </div>
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#F0FDF4', color: '#166534', fontWeight: 500 }}>
                  {store.isActive ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Integraciones</div>
                {store.integrations.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9CA3AF' }}>Sin integraciones configuradas</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {store.integrations.map((int: any) => {
                      const pc = PLATFORM_COLOR[int.platform] ?? { bg: '#F1F5F9', color: '#475569' }
                      return (
                        <div key={int.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: pc.bg, color: pc.color }}>
                            {platformLabel[int.platform] ?? int.platform}
                          </span>
                          <span style={{ fontSize: 11, color: int.isActive ? '#16A34A' : '#9CA3AF' }}>
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

      {/* Modal crear tienda */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 20 }}>Nueva tienda</div>

            {error && (
              <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#9F1239', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={lbl}>Nombre de la tienda *</label>
                <input style={inp} placeholder="Mi Tienda Online" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Email de contacto</label>
                <input type="email" style={inp} placeholder="tienda@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Teléfono</label>
                <input style={inp} placeholder="+56 9 xxxx xxxx" value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>RUT empresa</label>
                <input style={inp} placeholder="12.345.678-9" value={form.rut} onChange={e => set('rut', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setModal(false); setError('') }}
                style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving}
                style={{ padding: '9px 20px', background: saving ? '#93C5FD' : '#2563EB', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Creando...' : 'Crear tienda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
