export const dynamic = 'force-dynamic'

import { getSessionUser } from '@/lib/utils/auth'
import { getDashboardStats, listOrders } from '@/lib/services/order.service'
import Link from 'next/link'

const TZ = 'America/Santiago'

const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pendiente',
  RECEIVED:   'Recepcionado',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'No entregado',
  CANCELLED:  'Cancelado',
}

const STATUS_COLOR: Record<string, { bg: string; color: string; dot: string }> = {
  PENDING:    { bg:'rgba(245,158,11,0.1)',  color:'#FCD34D', dot:'#F59E0B' },
  RECEIVED:   { bg:'rgba(59,130,246,0.1)',  color:'#93C5FD', dot:'#3B82F6' },
  IN_TRANSIT: { bg:'rgba(99,102,241,0.1)',  color:'#A5B4FC', dot:'#6366F1' },
  DELIVERED:  { bg:'rgba(16,185,129,0.1)',  color:'#6EE7B7', dot:'#10B981' },
  INCIDENT:   { bg:'rgba(239,68,68,0.1)',   color:'#FCA5A5', dot:'#EF4444' },
  CANCELLED:  { bg:'rgba(107,114,128,0.1)', color:'#9CA3AF', dot:'#6B7280' },
}

const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:      'Shopify',
  MERCADOLIBRE: 'ML Flex',
  WOOCOMMERCE:  'WooCommerce',
  JUMPSELLER:   'Jumpseller',
  MANUAL:       'Manual',
}

const PLATFORM_COLOR: Record<string, string> = {
  SHOPIFY:      '#6366F1',
  MERCADOLIBRE: '#F59E0B',
  WOOCOMMERCE:  '#8B5CF6',
  JUMPSELLER:   '#10B981',
  MANUAL:       '#6B7280',
}

function fmtDate(d: Date) {
  const now      = new Date()
  const today    = new Date(now.toLocaleDateString('en-CA', { timeZone: TZ }))
  const orderDay = new Date(new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }))
  const diffDays = Math.round((today.getTime() - orderDay.getTime()) / (1000*60*60*24))
  if (diffDays === 0) return new Date(d).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone: TZ })
  if (diffDays === 1) return 'ayer'
  return `hace ${diffDays} días`
}

export default async function DashboardPage() {
  const user    = await getSessionUser()
  const storeId = user?.role === 'STORE_ADMIN' ? (user?.storeId ?? undefined) : undefined
  const canSeePending = user?.role === 'SUPER_ADMIN' || user?.role === 'STORE_ADMIN'

  const [statsHoy, statsTotal, recientes, pendientes] = await Promise.all([
    getDashboardStats(storeId, true),
    getDashboardStats(storeId, false),
    listOrders({ storeId, todayOnly: true, pageSize: 8, page: 1, status: undefined }),
    canSeePending
      ? listOrders({ storeId, status: 'PENDING', pageSize: 5, page: 1 })
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 5, totalPages: 0 }),
  ])

  const pct = (n: number) => statsHoy.total > 0 ? Math.round((n / statsHoy.total) * 100) : 0
  const today = new Date().toLocaleDateString('es-CL', {
    weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone: TZ,
  })

  const recientesActivos = recientes.items.filter(o => o.status !== 'PENDING')

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── Header ── */}
      <div>
        <h1 style={{ fontSize:22, fontWeight:600, color:'var(--text-primary)', margin:0 }}>
          Buenos días, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4, textTransform:'capitalize' }}>
          {today} · <strong style={{ color:'var(--text-secondary)' }}>{statsHoy.total}</strong> pedido{statsHoy.total!==1?'s':''} hoy
          {statsTotal.total > 0 && <span style={{ color:'var(--text-muted)' }}> · {statsTotal.total} en total</span>}
        </p>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12 }}>
        {[
          { label:'Pedidos hoy',    value:statsHoy.total,     accent:'#6366F1', sub:null,                                icon:'📦' },
          { label:'En camino',      value:statsHoy.inTransit, accent:'#818CF8', sub:`${pct(statsHoy.inTransit)}% del total`, icon:'🚚' },
          { label:'Entregados hoy', value:statsHoy.delivered, accent:'#10B981', sub:`${pct(statsHoy.delivered)}% NS`,   icon:'✅' },
          { label:'Incidencias',    value:statsHoy.incident,  accent:'#EF4444',
            sub: statsHoy.incident > 0 ? `${pct(statsHoy.incident)}% del total` : 'Sin incidencias', icon:'⚠️' },
        ].map(m => (
          <div key={m.label} style={{
            background:'var(--bg-card)',
            border:'1px solid var(--border)',
            borderRadius:12, padding:'18px 20px',
            borderLeft:`3px solid ${m.accent}`,
            transition:'transform 0.15s',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
              <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>{m.label}</div>
              <span style={{ fontSize:16 }}>{m.icon}</span>
            </div>
            <div style={{ fontSize:30, fontWeight:600, color:'var(--text-primary)', lineHeight:1 }}>{m.value}</div>
            {m.sub && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Por recepcionar ── */}
      {canSeePending && statsHoy.pending > 0 && (
        <div style={{
          background:'rgba(245,158,11,0.06)',
          border:'1px solid rgba(245,158,11,0.2)',
          borderRadius:12, padding:16,
        }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>🕐</span>
              <span style={{ fontSize:14, fontWeight:500, color:'#FCD34D' }}>Por recepcionar</span>
              <span style={{
                fontSize:11, fontWeight:600,
                background:'rgba(245,158,11,0.15)', color:'#FCD34D',
                padding:'2px 8px', borderRadius:20,
                border:'1px solid rgba(245,158,11,0.3)',
              }}>
                {statsHoy.pending} pedido{statsHoy.pending!==1?'s':''}
              </span>
            </div>
            <Link href="/recepciones?status=PENDING" style={{ fontSize:12, color:'var(--accent)', textDecoration:'none' }}>
              Ver todos →
            </Link>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {pendientes.items.map(o => {
              const now      = new Date()
              const today2   = new Date(now.toLocaleDateString('en-CA', { timeZone: TZ }))
              const orderDay = new Date(new Date(o.createdAt).toLocaleDateString('en-CA', { timeZone: TZ }))
              const isYesterday = today2.getTime() - orderDay.getTime() > 0
              return (
                <Link key={o.id} href={`/recepciones/${o.id}`} style={{
                  background:'var(--bg-card)',
                  border:'1px solid rgba(245,158,11,0.2)',
                  borderRadius:8, padding:'10px 14px',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  textDecoration:'none', transition:'background 0.15s',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--accent)', fontFamily:'monospace' }}>{o.orderNumber}</span>
                    <span style={{ fontSize:13, color:'var(--text-primary)' }}>{o.customerName}</span>
                    <span style={{ fontSize:11, color:'var(--text-muted)' }}>{o.addressComuna}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:11, color:'var(--text-muted)' }}>{PLATFORM_LABEL[o.platform] ?? o.platform}</span>
                    <span style={{
                      fontSize:11, background:'rgba(245,158,11,0.15)', color:'#FCD34D',
                      padding:'2px 8px', borderRadius:20, fontWeight:500,
                    }}>
                      {isYesterday ? fmtDate(o.createdAt) : 'Pendiente'}
                    </span>
                  </div>
                </Link>
              )
            })}
            {pendientes.total > 5 && (
              <Link href="/recepciones?status=PENDING"
                style={{ textAlign:'center', fontSize:12, color:'#FCD34D', padding:'6px', textDecoration:'none' }}>
                + {pendientes.total - 5} pedidos más →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Contenido principal ── */}
      {recientesActivos.length === 0 && statsHoy.pending === 0 ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {[
            { icon:'📦', title:'Sin pedidos hoy', desc:'Los pedidos de tus integraciones aparecerán aquí automáticamente',
              actions:[
                { href:'/pedidos/nuevo',       label:'+ Crear pedido',   bg:'var(--accent)', color:'white' },
                { href:'/pedidos/carga-masiva', label:'⬆ Carga Excel',   bg:'var(--bg-input)', color:'var(--text-secondary)' },
              ]},
            { icon:'⚡', title:'Conecta tus tiendas', desc:'Shopify, WooCommerce, Jumpseller y ML Flex se sincronizan automáticamente',
              actions:[
                { href:'/integraciones', label:'Configurar integraciones →', bg:'var(--accent)', color:'white' },
              ]},
          ].map(card => (
            <div key={card.title} style={{ background:'var(--bg-card)', border:'1px dashed var(--border-light)', borderRadius:12, padding:36, textAlign:'center' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>{card.icon}</div>
              <div style={{ fontSize:15, fontWeight:500, color:'var(--text-primary)', marginBottom:6 }}>{card.title}</div>
              <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:18 }}>{card.desc}</div>
              <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                {card.actions.map(a => (
                  <Link key={a.href} href={a.href} style={{ padding:'8px 16px', background:a.bg, color:a.color, borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : recientesActivos.length > 0 ? (
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>

          {/* Tabla pedidos activos */}
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>Pedidos de hoy en curso</span>
              <Link href="/recepciones" style={{ fontSize:12, color:'var(--accent)', textDecoration:'none' }}>Ver todos →</Link>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg-base)' }}>
                  {['Pedido','Cliente','Plataforma','Estado','Hora'].map(h => (
                    <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--text-muted)', borderBottom:'1px solid var(--border)', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recientesActivos.map(o => {
                  const sc = STATUS_COLOR[o.status] ?? STATUS_COLOR.PENDING
                  const isInTransit = o.status === 'IN_TRANSIT'
                  return (
                    <tr key={o.id} style={{ transition:'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:600 }}>
                        <Link href={`/recepciones/${o.id}`} style={{ color:'var(--accent)', textDecoration:'none' }}>
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--text-primary)' }}>{o.customerName}</td>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
                        {PLATFORM_LABEL[o.platform] ?? o.platform}
                      </td>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:500, background:sc.bg, color:sc.color }}>
                          {isInTransit ? (
                            <span className="pulse-dot" style={{ background:sc.dot }}/>
                          ) : (
                            <span style={{ width:5, height:5, borderRadius:'50%', background:sc.dot, display:'inline-block' }}/>
                          )}
                          {STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
                        {new Date(o.createdAt).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone: TZ })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Panel lateral */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Por plataforma */}
            <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:14 }}>Por plataforma hoy</div>
              {statsHoy.byPlatform.length === 0 ? (
                <div style={{ fontSize:13, color:'var(--text-muted)' }}>Sin datos</div>
              ) : statsHoy.byPlatform.map(p => {
                const pctV = statsHoy.total > 0 ? Math.round((p.count / statsHoy.total) * 100) : 0
                const color = PLATFORM_COLOR[p.platform] ?? '#6B7280'
                return (
                  <div key={p.platform} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:5 }}>
                      <span style={{ color:'var(--text-secondary)' }}>{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                      <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{p.count}</span>
                    </div>
                    <div style={{ height:4, background:'var(--bg-input)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pctV}%`, height:'100%', background:color, borderRadius:3, transition:'width 0.4s' }}/>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Acciones rápidas */}
            <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:12 }}>Acciones rápidas</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { href:'/pedidos/nuevo',          label:'+ Nuevo pedido',            bg:'var(--accent)',    color:'white' },
                  { href:'/pedidos/carga-masiva',    label:'⬆ Carga masiva Excel',     bg:'var(--bg-input)', color:'var(--text-secondary)' },
                  { href:'/recepciones?historial=1', label:'📋 Ver historial completo', bg:'var(--bg-input)', color:'var(--text-secondary)' },
                ].map(a => (
                  <Link key={a.href} href={a.href} style={{
                    padding:'9px 14px', background:a.bg, color:a.color,
                    borderRadius:8, fontSize:13, fontWeight:500,
                    textDecoration:'none', textAlign:'center',
                    border:'1px solid var(--border)',
                    transition:'opacity 0.15s',
                  }}>
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
