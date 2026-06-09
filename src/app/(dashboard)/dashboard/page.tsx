export const dynamic = 'force-dynamic'

import { getSessionUser } from '@/lib/utils/auth'
import { getDashboardStats, listOrders } from '@/lib/services/order.service'
import Link from 'next/link'

const TZ = 'America/Santiago'

const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Creado',
  RECEIVED:   'Recepcionado',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'No entregado',
  CANCELLED:  'Cancelado',
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  PENDING:    { bg:'#FFFBEB', color:'#92400E' },
  RECEIVED:   { bg:'#EFF6FF', color:'#1D4ED8' },
  IN_TRANSIT: { bg:'#F5F3FF', color:'#5B21B6' },
  DELIVERED:  { bg:'#F0FDF4', color:'#166534' },
  INCIDENT:   { bg:'#FFF1F2', color:'#9F1239' },
  CANCELLED:  { bg:'#F1F5F9', color:'#475569' },
}
const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:      'Shopify',
  MERCADOLIBRE: 'ML Flex',
  WOOCOMMERCE:  'WooCommerce',
  JUMPSELLER:   'Jumpseller',
  MANUAL:       'Manual',
}

function fmtDate(d: Date) {
  const now     = new Date()
  const today   = new Date(now.toLocaleDateString('en-CA', { timeZone: TZ }))
  const orderDay= new Date(new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }))
  const diffMs  = today.getTime() - orderDay.getTime()
  const diffDays= Math.round(diffMs / (1000 * 60 * 60 * 24))
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
    <div>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:500 }}>
          Buenos días, {user?.name?.split(' ')[0]}
        </h1>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:3, textTransform:'capitalize' }}>
          {today} · <strong>{statsHoy.total}</strong> pedido{statsHoy.total!==1?'s':''} hoy
          {statsTotal.total > 0 && (
            <span style={{ color:'#9CA3AF' }}> ({statsTotal.total} en total)</span>
          )}
        </p>
      </div>

      {/* Métricas del día */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Pedidos hoy',    value:statsHoy.total,     accent:'#2563EB', sub:null },
          { label:'En camino',      value:statsHoy.inTransit, accent:'#7C3AED', sub:`${pct(statsHoy.inTransit)}%` },
          { label:'Entregados hoy', value:statsHoy.delivered, accent:'#16A34A', sub:`${pct(statsHoy.delivered)}%` },
          { label:'Recepcionados',  value:statsHoy.received,  accent:'#D97706',
            sub: statsHoy.incident > 0 ? `${statsHoy.incident} no entregado${statsHoy.incident!==1?'s':''}` : null },
        ].map(m => (
          <div key={m.label} style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'18px 20px', borderLeft:`3px solid ${m.accent}` }}>
            <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>{m.label}</div>
            <div style={{ fontSize:28, fontWeight:500, lineHeight:1 }}>{m.value}</div>
            {m.sub && <div style={{ fontSize:12, color:'#9CA3AF', marginTop:4 }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Panel Por recepcionar */}
      {canSeePending && statsHoy.pending > 0 && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:16, marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>🕐</span>
              <span style={{ fontSize:14, fontWeight:500, color:'#92400E' }}>Por recepcionar</span>
              <span style={{ fontSize:11, fontWeight:500, background:'#FEF3C7', color:'#92400E', padding:'2px 8px', borderRadius:20, border:'1px solid #FDE68A' }}>
                {statsHoy.pending} pedido{statsHoy.pending!==1?'s':''}
              </span>
            </div>
            <Link href="/recepciones?status=PENDING" style={{ fontSize:12, color:'#2563EB', textDecoration:'none' }}>
              Ver todos →
            </Link>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {pendientes.items.map(o => {
              const now     = new Date()
              const today   = new Date(now.toLocaleDateString('en-CA', { timeZone: TZ }))
              const orderDay= new Date(new Date(o.createdAt).toLocaleDateString('en-CA', { timeZone: TZ }))
              const isYesterday = today.getTime() - orderDay.getTime() > 0
              return (
                <Link key={o.id} href={`/recepciones/${o.id}`}
                  style={{ background:'white', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', textDecoration:'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:500, color:'#1D4ED8', fontFamily:'monospace' }}>{o.orderNumber}</span>
                    <span style={{ fontSize:13, color:'#374151' }}>{o.customerName}</span>
                    <span style={{ fontSize:11, color:'#6B7280' }}>{o.addressComuna}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:11, color:'#6B7280' }}>{PLATFORM_LABEL[o.platform] ?? o.platform}</span>
                    <span style={{ fontSize:11, background:'#FFFBEB', color:'#92400E', padding:'2px 8px', borderRadius:20, border:'1px solid #FDE68A', fontWeight:500 }}>
                      Creado{isYesterday ? ' · ' + fmtDate(o.createdAt) : ''}
                    </span>
                  </div>
                </Link>
              )
            })}
            {pendientes.total > 5 && (
              <Link href="/recepciones?status=PENDING"
                style={{ textAlign:'center', fontSize:12, color:'#92400E', padding:'6px', textDecoration:'none' }}>
                + {pendientes.total - 5} pedidos más →
              </Link>
            )}
          </div>
        </div>
      )}

      {recientesActivos.length === 0 && statsHoy.pending === 0 ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ background:'white', border:'2px dashed #E2E8F0', borderRadius:12, padding:36, textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>📦</div>
            <div style={{ fontSize:15, fontWeight:500, marginBottom:6 }}>Sin pedidos hoy</div>
            <div style={{ fontSize:13, color:'#6B7280', marginBottom:18 }}>
              Los pedidos de tus integraciones aparecerán aquí automáticamente
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
              <Link href="/pedidos/nuevo" style={{ padding:'8px 16px', background:'#2563EB', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
                + Crear pedido
              </Link>
              <Link href="/pedidos/carga-masiva" style={{ padding:'8px 16px', background:'#0B1628', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
                ⬆ Carga Excel
              </Link>
            </div>
          </div>
          <div style={{ background:'white', border:'2px dashed #E2E8F0', borderRadius:12, padding:36, textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>⚡</div>
            <div style={{ fontSize:15, fontWeight:500, marginBottom:6 }}>Conecta tus tiendas</div>
            <div style={{ fontSize:13, color:'#6B7280', marginBottom:18 }}>
              Shopify, WooCommerce, Jumpseller y ML Flex se sincronizan automáticamente
            </div>
            <Link href="/integraciones" style={{ padding:'8px 16px', background:'#0B1628', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
              Configurar integraciones →
            </Link>
          </div>
        </div>
      ) : recientesActivos.length > 0 ? (
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #F1F5F9' }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Pedidos de hoy en curso</span>
              <Link href="/recepciones" style={{ fontSize:12, color:'#2563EB', textDecoration:'none' }}>
                Ver todos →
              </Link>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#F8FAFC' }}>
                  {['Pedido','Cliente','Plataforma','Estado','Hora'].map(h => (
                    <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recientesActivos.map(o => {
                  const sc = STATUS_COLOR[o.status] ?? STATUS_COLOR.PENDING
                  return (
                    <tr key={o.id}>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>
                        <Link href={`/recepciones/${o.id}`} style={{ color:'#1D4ED8', textDecoration:'none' }}>
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>{o.customerName}</td>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>
                        {PLATFORM_LABEL[o.platform] ?? o.platform}
                      </td>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid #F1F5F9' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:sc.bg, color:sc.color }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:sc.color }}/>
                          {STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td style={{ padding:'11px 14px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#9CA3AF' }}>
                        {new Date(o.createdAt).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone: TZ })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>Por plataforma hoy</div>
              {statsHoy.byPlatform.length === 0 ? (
                <div style={{ fontSize:13, color:'#9CA3AF' }}>Sin datos</div>
              ) : statsHoy.byPlatform.map(p => {
                const pctV = statsHoy.total > 0 ? Math.round((p.count / statsHoy.total) * 100) : 0
                return (
                  <div key={p.platform} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                      <span style={{ color:'#4B5563' }}>{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                      <span style={{ fontWeight:500 }}>{p.count}</span>
                    </div>
                    <div style={{ height:5, background:'#F1F5F9', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pctV}%`, height:'100%', background:'#2563EB', borderRadius:3 }}/>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Acciones rápidas</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { href:'/pedidos/nuevo',          label:'+ Nuevo pedido',            bg:'#2563EB', color:'white',    border:'none' },
                  { href:'/pedidos/carga-masiva',    label:'⬆ Carga masiva Excel',     bg:'#0B1628', color:'white',    border:'none' },
                  { href:'/recepciones?historial=1', label:'📋 Ver historial completo', bg:'white',   color:'#374151', border:'1px solid #E2E8F0' },
                ].map(a => (
                  <Link key={a.href} href={a.href}
                    style={{ padding:'9px 14px', background:a.bg, color:a.color, borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none', textAlign:'center', border:a.border }}>
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
