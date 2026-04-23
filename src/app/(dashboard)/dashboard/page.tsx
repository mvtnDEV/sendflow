export const dynamic = 'force-dynamic'

import { getSessionUser } from '@/lib/utils/auth'
import { getDashboardStats, listOrders } from '@/lib/services/order.service'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  PENDING:'Pendiente', RECEIVED:'Recepcionado', IN_TRANSIT:'En camino',
  DELIVERED:'Entregado', INCIDENT:'Incidencia', CANCELLED:'Cancelado',
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  PENDING:    { bg:'#FFFBEB', color:'#92400E' },
  RECEIVED:   { bg:'#EFF6FF', color:'#1D4ED8' },
  IN_TRANSIT: { bg:'#F0FDF4', color:'#166534' },
  DELIVERED:  { bg:'#F5F3FF', color:'#5B21B6' },
  INCIDENT:   { bg:'#FFF1F2', color:'#9F1239' },
  CANCELLED:  { bg:'#F1F5F9', color:'#475569' },
}
const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:'Shopify', MERCADOLIBRE:'ML Flex',
  WOOCOMMERCE:'WooCommerce', JUMPSELLER:'Jumpseller', MANUAL:'Manual',
}

export default async function DashboardPage() {
  const user    = await getSessionUser()
  const storeId = user?.role === 'STORE_ADMIN' ? (user?.storeId ?? undefined) : undefined

  // Siempre muestra stats y pedidos de HOY
  const [statsHoy, statsTotal, recientes] = await Promise.all([
    getDashboardStats(storeId, true),   // stats del día
    getDashboardStats(storeId, false),  // total histórico (para referencia)
    listOrders({ storeId, todayOnly: true, pageSize: 8, page: 1 }),
  ])

  const pct = (n: number) => statsHoy.total > 0 ? Math.round((n / statsHoy.total) * 100) : 0

  const today = new Date().toLocaleDateString('es-CL', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  })

  return (
    <div>
      {/* Saludo */}
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
          { label:'Pedidos hoy',     value:statsHoy.total,     accent:'#2563EB', sub:null },
          { label:'En camino',       value:statsHoy.inTransit, accent:'#16A34A', sub:`${pct(statsHoy.inTransit)}%` },
          { label:'Entregados hoy',  value:statsHoy.delivered, accent:'#7C3AED', sub:`${pct(statsHoy.delivered)}%` },
          { label:'Por recepcionar', value:statsHoy.pending,   accent:'#D97706', sub:statsHoy.incident>0?`${statsHoy.incident} incidencia${statsHoy.incident!==1?'s':''}`:null },
        ].map(m => (
          <div key={m.label} style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'18px 20px', borderLeft:`3px solid ${m.accent}` }}>
            <div style={{ fontSize:12, color:'#6B7280', marginBottom:6 }}>{m.label}</div>
            <div style={{ fontSize:28, fontWeight:500, lineHeight:1 }}>{m.value}</div>
            {m.sub && (
              <div style={{ fontSize:12, color:'#9CA3AF', marginTop:4 }}>{m.sub}</div>
            )}
          </div>
        ))}
      </div>

      {statsHoy.total === 0 ? (
        /* Empty state */
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
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
          {/* Pedidos de hoy */}
          <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #F1F5F9' }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Últimos pedidos de hoy</span>
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
                {recientes.items.map(o => {
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
                        {new Date(o.createdAt).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Panel lateral */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Por plataforma hoy */}
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

            {/* Accesos rápidos */}
            <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:12 }}>Acciones rápidas</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { href:'/pedidos/nuevo',        label:'+ Nuevo pedido',          bg:'#2563EB', color:'white' },
                  { href:'/pedidos/carga-masiva',  label:'⬆ Carga masiva Excel',   bg:'#0B1628', color:'white' },
                  { href:'/recepciones?historial=1', label:'📋 Ver historial completo', bg:'white', color:'#374151', border:'1px solid #E2E8F0' },
                ].map(a => (
                  <Link key={a.href} href={a.href}
                    style={{ padding:'9px 14px', background:a.bg, color:a.color, borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none', textAlign:'center', border:(a as any).border }}>
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
