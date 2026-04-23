'use client'
import { useState } from 'react'

type Tab = 'SHOPIFY' | 'WOOCOMMERCE' | 'JUMPSELLER' | 'MERCADOLIBRE'

const PLATFORMS: { key: Tab; label: string; color: string; bg: string; border: string }[] = [
  { key:'SHOPIFY',      label:'Shopify',       color:'#1D4ED8', bg:'#EFF6FF', border:'#BFDBFE' },
  { key:'WOOCOMMERCE',  label:'WooCommerce',   color:'#5B21B6', bg:'#F5F3FF', border:'#DDD6FE' },
  { key:'JUMPSELLER',   label:'Jumpseller',    color:'#C2410C', bg:'#FFF7ED', border:'#FED7AA' },
  { key:'MERCADOLIBRE', label:'ML Flex',        color:'#B45309', bg:'#FFFBEB', border:'#FDE68A' },
]

const STEPS: Record<Tab, string[]> = {
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

export default function IntegracionesClient({ stores }: { stores: Store[] }) {
  const [storeId,  setStoreId]  = useState(stores[0]?.id ?? '')
  const [tab,      setTab]      = useState<Tab>('SHOPIFY')
  const [form,     setForm]     = useState({ key1:'', key2:'', key3:'', secret:'' })
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [testOk,   setTestOk]   = useState<boolean|null>(null)

  const set  = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const plat = PLATFORMS.find(p => p.key === tab)!

  const store = stores.find(s => s.id === storeId)
  const integration = store?.integrations.find(i => i.platform === tab)

  async function handleSave() {
    if (!storeId) return
    setSaving(true)
    try {
      const credentials: Record<string,string> = {}
      if (tab === 'SHOPIFY') {
        credentials.domain      = form.key1
        credentials.accessToken = form.key2
        credentials.webhookSecret = form.secret
      } else if (tab === 'WOOCOMMERCE') {
        credentials.url           = form.key1
        credentials.consumerKey   = form.key2
        credentials.consumerSecret= form.key3
        credentials.webhookSecret = form.secret
      } else if (tab === 'JUMPSELLER') {
        credentials.login         = form.key1
        credentials.authToken     = form.key2
        credentials.webhookToken  = form.secret
      } else {
        credentials.clientId      = form.key1
        credentials.clientSecret  = form.key2
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
    // Simulación de prueba de conexión
    await new Promise(r => setTimeout(r, 1200))
    setTestOk(form.key1.length > 0 && form.key2.length > 0)
  }

  function copyWebhookUrl() {
    const base = window.location.origin
    const paths: Record<Tab,string> = {
      SHOPIFY:      `${base}/api/webhooks/shopify`,
      WOOCOMMERCE:  `${base}/api/webhooks/woocommerce`,
      JUMPSELLER:   `${base}/api/webhooks/jumpseller?token=${form.secret || 'TU_TOKEN'}`,
      MERCADOLIBRE: `${base}/api/webhooks/mercadolibre`,
    }
    navigator.clipboard.writeText(paths[tab])
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
          Conecta Shopify, WooCommerce, Jumpseller y ML Flex para importar pedidos automáticamente
        </p>
      </div>

      {/* Selector de tienda */}
      <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:13, fontWeight:500, flexShrink:0 }}>Tienda:</span>
        <select value={storeId} onChange={e => setStoreId(e.target.value)}
          style={{ padding:'7px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit', maxWidth:280 }}>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {saved && <span style={{ fontSize:12, color:'#166534', background:'#F0FDF4', padding:'4px 12px', borderRadius:20, fontWeight:500 }}>✓ Guardado</span>}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {PLATFORMS.map(p => {
          const active = tab === p.key
          const connected = store?.integrations.some(i => i.platform === p.key && i.isActive)
          return (
            <button key={p.key} onClick={() => setTab(p.key)}
              style={{ padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer',
                border: `1.5px solid ${active ? p.border : '#E2E8F0'}`,
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

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {/* Formulario */}
        <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:24 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
            <div style={{ fontSize:14, fontWeight:500 }}>Credenciales de {plat.label}</div>
            {integration?.isActive && (
              <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, background:'#F0FDF4', color:'#166534', fontWeight:500 }}>
                ● Conectado
              </span>
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
              <input style={inp} placeholder="App ID de ML" value={form.key1} onChange={e=>set('key1',e.target.value)}/>
              <div style={hint}>developers.mercadolibre.com → tu aplicación</div>
            </div>
            <div style={{ marginBottom:13 }}>
              <label style={lbl}>Client Secret</label>
              <input style={inp} type="password" placeholder="Secret Key" value={form.key2} onChange={e=>set('key2',e.target.value)}/>
            </div>
            <div style={{ marginBottom:0, background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:12, color:'#92400E', lineHeight:1.6 }}>
                <strong>ML Flex requiere OAuth.</strong> Después de guardar las credenciales, el usuario de ML Flex debe autorizar la app para que pueda recibir notificaciones de pedidos.
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
          {/* URL Webhook */}
          <div style={{ background:'white', border:`1px solid ${plat.border}`, borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:6 }}>URL del Webhook</div>
            <div style={{ fontSize:12, color:'#6B7280', marginBottom:10 }}>
              Copia esta URL y configúrala en {plat.label}
            </div>
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

          {/* Pasos */}
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>Cómo configurar en {plat.label}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {STEPS[tab].map((step, i) => (
                <div key={i} style={{ display:'flex', gap:10, fontSize:12 }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:plat.bg, color:plat.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500, flexShrink:0 }}>
                    {i+1}
                  </div>
                  <span style={{ color:'#374151', lineHeight:1.5, paddingTop:3 }}>{step}</span>
                </div>
              ))}
            </div>

            {/* Alternativa Excel */}
            <div style={{ marginTop:14, padding:'10px 14px', background:'#F8FAFC', borderRadius:8, fontSize:12, color:'#6B7280', lineHeight:1.6 }}>
              <strong style={{ color:'#374151' }}>Alternativa sin webhook:</strong> exporta los pedidos del día desde {plat.label} en Excel/CSV y súbelos en{' '}
              <a href="/pedidos/carga-masiva" style={{ color:'#2563EB' }}>Carga masiva</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
