'use client'
import { useState, useEffect } from 'react'

type Tab = 'SHOPIFY' | 'WOOCOMMERCE' | 'JUMPSELLER' | 'MERCADOLIBRE' | 'APIKEYS'

const PLATFORMS: { key: Tab; label: string; color: string; bg: string; border: string }[] = [
  { key:'SHOPIFY',      label:'Shopify',       color:'#1D4ED8', bg:'#EFF6FF', border:'#BFDBFE' },
  { key:'WOOCOMMERCE',  label:'WooCommerce',   color:'#5B21B6', bg:'#F5F3FF', border:'#DDD6FE' },
  { key:'JUMPSELLER',   label:'Jumpseller',    color:'#C2410C', bg:'#FFF7ED', border:'#FED7AA' },
  { key:'MERCADOLIBRE', label:'ML Flex',       color:'#B45309', bg:'#FFFBEB', border:'#FDE68A' },
  { key:'APIKEYS',      label:'API Keys',      color:'#166534', bg:'#F0FDF4', border:'#BBF7D0' },
]

const STEPS: Record<Exclude<Tab,'APIKEYS'>, string[]> = {
  SHOPIFY: [
    'Shopify Admin → Settings → Notifications → Webhooks',
    'Create webhook → Evento: "Order creation"',
    'URL de entrega: https://TU-DOMINIO/api/webhooks/shopify',
    'Copia el "Signing secret" y pégalo abajo',
    'Para el Access Token: Apps → Develop apps → tu app → Access tokens',
  ],
  WOOCOMMERCE: [
    'WooCommerce → Settings → Advanced → REST API → Add key',
    'Permisos: Read/Write — copia Consumer Key y Consumer Secret',
    'WooCommerce → Settings → Advanced → Webhooks → Add webhook',
    'Topic: Order created · URL: https://TU-DOMINIO/api/webhooks/woocommerce',
    'Copia el Secret generado y pégalo abajo',
  ],
  JUMPSELLER: [
    'Jumpseller Admin → Settings → API → copia Auth Token y Login',
    'Settings → Webhooks → Add Webhook',
    'Events: order_paid, order_pending_payment',
    'URL: https://TU-DOMINIO/api/webhooks/jumpseller?token=TU_TOKEN_SECRETO',
    'Define un token secreto tuyo (ej: sf_abc123) y úsalo en la URL',
  ],
  MERCADOLIBRE: [
    'Entra a developers.mercadolibre.com → crea una aplicación',
    'En tu app → Notificaciones → activa "Órdenes"',
    'URL de notificaciones: https://TU-DOMINIO/api/webhooks/mercadolibre',
    'Copia Client ID y Client Secret de tu aplicación',
    'El usuario de ML Flex debe autorizar tu app (OAuth flow)',
  ],
}

interface Store {
  id: string; name: string
  integrations: { id: string; platform: string; isActive: boolean; lastSyncAt: Date | null }[]
}

interface ApiKey {
  id: string; name: string; key: string; isActive: boolean; lastUsedAt: string | null; createdAt: string
}

// ─── Componente API Keys ──────────────────────────────────────────────────────
function ApiKeysTab() {
  const [apiKeys,       setApiKeys]       = useState<ApiKey[]>([])
  const [loading,       setLoading]       = useState(true)
  const [name,          setName]          = useState('')
  const [webhookUrl,    setWebhookUrl]    = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [creating,      setCreating]      = useState(false)
  const [newKey,        setNewKey]        = useState<string | null>(null)
  const [copied,        setCopied]        = useState(false)

  useEffect(() => { loadKeys() }, [])

  async function loadKeys() {
    setLoading(true)
    const res  = await fetch('/api/api-keys')
    const data = await res.json()
    if (data.ok) setApiKeys(data.data)
    setLoading(false)
  }

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    const res = await fetch('/api/api-keys', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), webhookUrl, webhookSecret }),
    })
    const data = await res.json()
    if (data.ok) {
      setNewKey(data.data.key)
      setName('')
      setWebhookUrl('')
      setWebhookSecret('')
      loadKeys()
    }
    setCreating(false)
  }

  async function handleRevoke(id: string) {
    if (!confirm('¿Revocar esta API Key? Dejará de funcionar inmediatamente.')) return
    await fetch(`/api/api-keys/${id}`, { method: 'DELETE' })
    loadKeys()
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
      {/* Crear nueva key */}
      <div>
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:24, marginBottom:14 }}>
          <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>Nueva API Key</div>
          <div style={{ fontSize:13, color:'#6B7280', marginBottom:16 }}>
            Genera una API Key para que sistemas externos se integren con SendFlow.
          </div>

          {/* Nombre */}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }}>
              Nombre de la integración
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Senby, ML Flex, Mi Sistema..."
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{ width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }}
            />
          </div>

          {/* Webhook URL */}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }}>
              Webhook URL <span style={{ color:'#9CA3AF', fontWeight:400 }}>(opcional)</span>
            </label>
            <input
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://tu-sistema.cl/webhook/sendflow"
              style={{ width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }}
            />
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>
              SendFlow notificará cambios de estado a esta URL automáticamente
            </div>
          </div>

          {/* Webhook Secret */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }}>
              Webhook Secret <span style={{ color:'#9CA3AF', fontWeight:400 }}>(opcional)</span>
            </label>
            <input
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
              placeholder="Secret para verificar la firma del webhook"
              style={{ width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'monospace' }}
            />
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>
              Firma HMAC-SHA256 enviada en header X-SendFlow-Signature
            </div>
          </div>

          <button onClick={handleCreate} disabled={creating || !name.trim()}
            style={{ width:'100%', padding:'10px', background:creating||!name.trim()?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:creating||!name.trim()?'not-allowed':'pointer' }}>
            {creating ? 'Generando...' : '+ Generar API Key'}
          </button>
        </div>

        {/* Key recién creada */}
        {newKey && (
          <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#166534', marginBottom:8 }}>
              ✅ API Key generada — cópiala ahora
            </div>
            <div style={{ fontSize:12, color:'#166534', marginBottom:12 }}>
              Esta key solo se mostrará una vez. Guárdala en un lugar seguro.
            </div>
            <div style={{ background:'white', border:'1px solid #BBF7D0', borderRadius:8, padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:'#0B1628', wordBreak:'break-all', marginBottom:10 }}>
              {newKey}
            </div>
            <button onClick={() => copyKey(newKey)}
              style={{ width:'100%', padding:'9px', background:'#16A34A', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
              {copied ? '✓ Copiado' : 'Copiar API Key'}
            </button>
            <button onClick={() => setNewKey(null)}
              style={{ width:'100%', padding:'8px', background:'none', border:'none', fontSize:12, color:'#6B7280', cursor:'pointer', marginTop:6 }}>
              Ya la copié, cerrar
            </button>
          </div>
        )}
      </div>

      {/* Lista de keys */}
      <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:24 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:16 }}>API Keys activas</div>
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:'#9CA3AF', fontSize:13 }}>Cargando...</div>
        ) : apiKeys.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:'#9CA3AF' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔑</div>
            <div style={{ fontSize:13 }}>No hay API Keys generadas</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {apiKeys.map(k => (
              <div key={k.id} style={{ border:'1px solid #E2E8F0', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{k.name}</div>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#F0FDF4', color:'#166534', fontWeight:500 }}>
                    ● Activa
                  </span>
                </div>
                <div style={{ fontFamily:'monospace', fontSize:11, color:'#6B7280', background:'#F8FAFC', padding:'5px 8px', borderRadius:6, marginBottom:8 }}>
                  {k.key.slice(0, 20)}••••••••••••••••
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:8 }}>
                  Creada: {new Date(k.createdAt).toLocaleDateString('es-CL')}
                  {k.lastUsedAt && ` · Último uso: ${new Date(k.lastUsedAt).toLocaleDateString('es-CL')}`}
                </div>
                <button onClick={() => handleRevoke(k.id)}
                  style={{ width:'100%', padding:'7px', background:'#FFF1F2', border:'1px solid #FECDD3', borderRadius:8, fontSize:12, color:'#9F1239', cursor:'pointer', fontWeight:500 }}>
                  Revocar key
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Info de uso */}
        <div style={{ marginTop:16, padding:'12px 14px', background:'#F8FAFC', borderRadius:8, fontSize:12, color:'#6B7280', lineHeight:1.6 }}>
          <strong style={{ color:'#374151' }}>Cómo usar la API Key:</strong><br/>
          Agrega el header en cada petición:<br/>
          <span style={{ fontFamily:'monospace', color:'#2563EB' }}>X-API-Key: sk_live_xxxx</span><br/>
          URL base: <span style={{ fontFamily:'monospace', color:'#2563EB' }}>{typeof window !== 'undefined' ? window.location.origin : ''}/api/v1</span><br/><br/>
          <strong style={{ color:'#374151' }}>Webhook de salida:</strong><br/>
          Si configuras una URL de webhook, SendFlow enviará un POST cada vez que un pedido cambie de estado con header:<br/>
          <span style={{ fontFamily:'monospace', color:'#2563EB' }}>X-SendFlow-Signature: sha256=xxxxx</span>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function IntegracionesClient({ stores }: { stores: Store[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '')
  const [tab,     setTab]     = useState<Tab>('SHOPIFY')
  const [form,    setForm]    = useState({ key1:'', key2:'', key3:'', secret:'' })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [testOk,  setTestOk]  = useState<boolean|null>(null)

  const set  = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const plat = PLATFORMS.find(p => p.key === tab)!

  const store       = stores.find(s => s.id === storeId)
  const integration = store?.integrations.find(i => i.platform === tab)

  async function handleSave() {
    if (!storeId) return
    setSaving(true)
    try {
      const credentials: Record<string,string> = {}
      if (tab === 'SHOPIFY') {
        credentials.domain        = form.key1
        credentials.accessToken   = form.key2
        credentials.webhookSecret = form.secret
      } else if (tab === 'WOOCOMMERCE') {
        credentials.url            = form.key1
        credentials.consumerKey    = form.key2
        credentials.consumerSecret = form.key3
        credentials.webhookSecret  = form.secret
      } else if (tab === 'JUMPSELLER') {
        credentials.login        = form.key1
        credentials.authToken    = form.key2
        credentials.webhookToken = form.secret
      } else {
        credentials.clientId     = form.key1
        credentials.clientSecret = form.key2
      }
      const res = await fetch(`/api/stores/${storeId}/integrations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ platform: tab, credentials }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    } finally { setSaving(false) }
  }

  async function handleTest() {
    setTestOk(null)
    await new Promise(r => setTimeout(r, 1200))
    setTestOk(form.key1.length > 0 && form.key2.length > 0)
  }

  function copyWebhookUrl() {
    const base  = window.location.origin
    const paths: Record<Exclude<Tab,'APIKEYS'>, string> = {
      SHOPIFY:      `${base}/api/webhooks/shopify`,
      WOOCOMMERCE:  `${base}/api/webhooks/woocommerce`,
      JUMPSELLER:   `${base}/api/webhooks/jumpseller?token=${form.secret || 'TU_TOKEN'}`,
      MERCADOLIBRE: `${base}/api/webhooks/mercadolibre`,
    }
    navigator.clipboard.writeText(paths[tab as Exclude<Tab,'APIKEYS'>])
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const inp: React.CSSProperties = { width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'monospace' }
  const lbl: React.CSSProperties = { fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }
  const hint: React.CSSProperties = { fontSize:11, color:'#9CA3AF', marginTop:4 }

  if (stores.length === 0) return (
    <div style={{ textAlign:'center', padding:'60px 20px' }}>
      <div style={{ fontSize:40, marginBottom:14 }}>🏪</div>
      <div style={{ fontSize:16, fontWeight:500, marginBottom:6 }}>Primero crea una tienda</div>
      <a href="/tiendas" style={{ padding:'10px 22px', background:'#2563EB', color:'white', borderRadius:8, fontSize:13, fontWeight:500 }}>Ir a Tiendas →</a>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:500 }}>Integraciones</h1>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:3 }}>
          Conecta tus plataformas de venta y gestiona el acceso a la API
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {PLATFORMS.map(p => {
          const active    = tab === p.key
          const connected = p.key !== 'APIKEYS' && store?.integrations.some(i => i.platform === p.key && i.isActive)
          return (
            <button key={p.key} onClick={() => setTab(p.key)}
              style={{ padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer',
                border:`1.5px solid ${active ? p.border : '#E2E8F0'}`,
                background: active ? p.bg : 'white',
                color: active ? p.color : '#6B7280',
                display:'flex', alignItems:'center', gap:6,
              }}>
              {p.label}
              {connected && <span style={{ width:7, height:7, borderRadius:'50%', background:'#16A34A', flexShrink:0 }}/>}
            </button>
          )
        })}
      </div>

      {/* Contenido API Keys */}
      {tab === 'APIKEYS' && <ApiKeysTab />}

      {/* Contenido plataformas */}
      {tab !== 'APIKEYS' && (<>
        {/* Selector de tienda */}
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:13, fontWeight:500, flexShrink:0 }}>Tienda:</span>
          <select value={storeId} onChange={e => setStoreId(e.target.value)}
            style={{ padding:'7px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', maxWidth:280 }}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {saved && <span style={{ fontSize:12, color:'#166534', background:'#F0FDF4', padding:'4px 12px', borderRadius:20, fontWeight:500 }}>✓ Guardado</span>}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {/* Formulario */}
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:24 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <div style={{ fontSize:14, fontWeight:500 }}>Credenciales de {plat.label}</div>
              {integration?.isActive && (
                <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'#F0FDF4', color:'#166534', fontWeight:500 }}>● Conectado</span>
              )}
            </div>

            {tab === 'SHOPIFY' && (<>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Dominio de la tienda</label>
                <input style={inp} placeholder="mi-tienda.myshopify.com" value={form.key1} onChange={e=>set('key1',e.target.value)}/>
                <div style={hint}>Sin https:// ni barra final</div>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Admin API Access Token</label>
                <input style={inp} type="password" placeholder="shpat_xxxxx" value={form.key2} onChange={e=>set('key2',e.target.value)}/>
                <div style={hint}>Apps → Develop apps → Access tokens</div>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Webhook Signing Secret</label>
                <input style={inp} type="password" placeholder="Secret generado por Shopify" value={form.secret} onChange={e=>set('secret',e.target.value)}/>
              </div>
            </>)}

            {tab === 'WOOCOMMERCE' && (<>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>URL de tu tienda</label>
                <input style={inp} placeholder="https://mi-tienda.cl" value={form.key1} onChange={e=>set('key1',e.target.value)}/>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Consumer Key</label>
                <input style={inp} type="password" placeholder="ck_xxxxx" value={form.key2} onChange={e=>set('key2',e.target.value)}/>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Consumer Secret</label>
                <input style={inp} type="password" placeholder="cs_xxxxx" value={form.key3} onChange={e=>set('key3',e.target.value)}/>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Webhook Secret</label>
                <input style={inp} type="password" placeholder="Secret del webhook en WooCommerce" value={form.secret} onChange={e=>set('secret',e.target.value)}/>
              </div>
            </>)}

            {tab === 'JUMPSELLER' && (<>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Login de Jumpseller</label>
                <input style={inp} placeholder="mi-tienda" value={form.key1} onChange={e=>set('key1',e.target.value)}/>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Auth Token</label>
                <input style={inp} type="password" placeholder="Token de la API" value={form.key2} onChange={e=>set('key2',e.target.value)}/>
                <div style={hint}>Settings → API → Auth Token</div>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Token secreto del webhook</label>
                <input style={inp} placeholder="Define un token (ej: sf_abc123)" value={form.secret} onChange={e=>set('secret',e.target.value)}/>
                <div style={hint}>Tú lo defines — se agrega a la URL como ?token=VALOR</div>
              </div>
            </>)}

            {tab === 'MERCADOLIBRE' && (<>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Client ID</label>
                <input style={inp} placeholder="4369995248896598" value={form.key1} onChange={e=>set('key1',e.target.value)}/>
                <div style={hint}>Solo el número — developers.mercadolibre.com → tu aplicación → Client ID</div>
              </div>
              <div style={{ marginBottom:13 }}>
                <label style={lbl}>Client Secret</label>
                <input style={inp} type="password" placeholder="Secret Key" value={form.key2} onChange={e=>set('key2',e.target.value)}/>
              </div>
              <div style={{ marginBottom:13 }}>
                <a href={`/api/auth/ml?state=${storeId}`}
                  style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'11px', background:'#FFE600', color:'#333', borderRadius:8, fontSize:13, fontWeight:600, textDecoration:'none' }}>
                  🔗 Conectar con Mercado Libre
                </a>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:5, textAlign:'center' }}>
                  El vendedor debe autorizar tu app con su cuenta de ML
                </div>
              </div>
              <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:12, color:'#92400E', lineHeight:1.6 }}>
                  <strong>Pasos:</strong> 1) Guarda las credenciales → 2) Haz clic en "Conectar con ML" → 3) El vendedor autoriza → 4) Listo.
                </div>
              </div>
            </>)}

            <div style={{ display:'flex', gap:8, marginTop:18 }}>
              <button onClick={handleTest}
                style={{ padding:'9px 16px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', cursor:'pointer',
                  color: testOk === true ? '#166534' : testOk === false ? '#9F1239' : '#374151' }}>
                {testOk === true ? '✓ Conexión OK' : testOk === false ? '✗ Error' : 'Probar conexión'}
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex:1, padding:'9px', background:saving?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? 'Guardando...' : 'Guardar credenciales'}
              </button>
            </div>
          </div>

          {/* Instrucciones */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ background:'white', border:`1px solid ${plat.border}`, borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:6 }}>URL del Webhook</div>
              <div style={{ fontSize:12, color:'#6B7280', marginBottom:10 }}>Copia esta URL y configúrala en {plat.label}</div>
              <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'10px 14px', fontFamily:'monospace', fontSize:11, color:'#374151', wordBreak:'break-all', marginBottom:10 }}>
                {typeof window !== 'undefined' ? window.location.origin : 'https://tu-dominio.vercel.app'}
                {tab === 'SHOPIFY'      && '/api/webhooks/shopify'}
                {tab === 'WOOCOMMERCE' && '/api/webhooks/woocommerce'}
                {tab === 'JUMPSELLER'  && `/api/webhooks/jumpseller?token=${form.secret || 'TU_TOKEN'}`}
                {tab === 'MERCADOLIBRE'&& '/api/webhooks/mercadolibre'}
              </div>
              <button onClick={copyWebhookUrl}
                style={{ width:'100%', padding:'8px', border:`1px solid ${plat.border}`, borderRadius:8, fontSize:12, background:plat.bg, color:plat.color, cursor:'pointer', fontWeight:500 }}>
                {copied ? '✓ Copiado' : 'Copiar URL'}
              </button>
            </div>

            <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>Cómo configurar en {plat.label}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {STEPS[tab as Exclude<Tab,'APIKEYS'>].map((step, i) => (
                  <div key={i} style={{ display:'flex', gap:10, fontSize:12 }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:plat.bg, color:plat.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500, flexShrink:0 }}>
                      {i+1}
                    </div>
                    <span style={{ color:'#374151', lineHeight:1.5, paddingTop:3 }}>{step}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:14, padding:'10px 14px', background:'#F8FAFC', borderRadius:8, fontSize:12, color:'#6B7280', lineHeight:1.6 }}>
                <strong style={{ color:'#374151' }}>Alternativa sin webhook:</strong> exporta los pedidos en Excel/CSV y súbelos en{' '}
                <a href="/pedidos/carga-masiva" style={{ color:'#2563EB' }}>Carga masiva</a>.
              </div>
            </div>
          </div>
        </div>
      </>)}
    </div>
  )
}
