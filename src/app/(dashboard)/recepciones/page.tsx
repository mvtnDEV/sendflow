export const dynamic = 'force-dynamic'
import { getSessionUser } from '@/lib/utils/auth'
import { listOrders, getDashboardStats } from '@/lib/services/order.service'
import { prisma } from '@/lib/db/prisma'
import Link from 'next/link'
import RecepcionesClient from './client'

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  PENDING:    { bg: '#FFFBEB', color: '#92400E' },
  RECEIVED:   { bg: '#EFF6FF', color: '#1D4ED8' },
  IN_TRANSIT: { bg: '#F5F3FF', color: '#5B21B6' },
  DELIVERED:  { bg: '#F0FDF4', color: '#166534' },
  INCIDENT:   { bg: '#FFF1F2', color: '#9F1239' },
}
const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pendiente',
  RECEIVED:   'Recepcionado',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'No entregado',
}
const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:       'Shopify',
  MERCADOLIBRE:  'ML Flex',
  WOOCOMMERCE:   'WooCommerce',
  JUMPSELLER:    'Jumpseller',
  MANUAL:        'Manual',
}

const TZ = 'America/Santiago'

function fmtTime(date: Date | string) {
  return new Date(date).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone: TZ })
}
function fmtDate(date: Date | string) {
  return new Date(date).toLocaleDateString('es-CL', { day:'2-digit', month:'short', timeZone: TZ })
}

interface Props {
  searchParams: {
    status?: string; search?: string; platform?: string
    dateFrom?: string; dateTo?: string; historial?: string
    page?: string; storeId?: string
  }
}

export default async function RecepcionesPage({ searchParams }: Props) {
  const user        = await getSessionUser()
  const userStoreId = user?.role === 'STORE_ADMIN' ? (user?.storeId ?? undefined) : undefined
  const filterStore = userStoreId || searchParams.storeId || undefined
  const page        = Number(searchParams.page ?? 1)
  const verTodo     = searchParams.historial === '1'
  const todayOnly   = !verTodo && !searchParams.dateFrom && !searchParams.dateTo
  const today       = new Date()
  const todayStr    = today.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', timeZone: TZ })

  const [stats, result, stores] = await Promise.all([
    getDashboardStats(filterStore, todayOnly),
    listOrders({
      storeId:  filterStore,
      status:   searchParams.status,
      search:   searchParams.search,
      platform: searchParams.platform,
      dateFrom: searchParams.dateFrom,
      dateTo:   searchParams.dateTo,
      todayOnly, page, pageSize: 15,
    }),
    user?.role === 'SUPER_ADMIN'
      ? prisma.store.findMany({ select: { id:true, name:true }, orderBy: { name:'asc' } })
      : Promise.resolve([]),
  ])

  const pct = (n: number) => stats.total > 0 ? Math.round((n / stats.total) * 100) : 0

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:500 }}>
            {todayOnly ? 'Pedidos de hoy' : verTodo ? 'Todos los pedidos' : 'Pedidos filtrados'}
          </h1>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:2 }}>
            {todayOnly
              ? `${todayStr} · ${stats.total} pedido${stats.total !== 1 ? 's' : ''}`
              : `${result.total} pedido${result.total !== 1 ? 's' : ''} encontrados`}
          </p>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <Link href="/recepciones"
            style={{ padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:500, textDecoration:'none', background:todayOnly?'#0B1628':'white', color:todayOnly?'white':'#6B7280', border:`1px solid ${todayOnly?'#0B1628':'#E2E8F0'}` }}>
            Hoy
          </Link>
          <Link href="/recepciones?historial=1"
            style={{ padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:500, textDecoration:'none', background:verTodo?'#0B1628':'white', color:verTodo?'white':'#6B7280', border:`1px solid ${verTodo?'#0B1628':'#E2E8F0'}` }}>
            Ver historial completo
          </Link>
        </div>
      </div>

      {/* Stat bar */}
      <div style={{ background:'#0B1628', borderRadius:12, padding:'14px 20px', display:'flex', marginBottom:16 }}>
        {[
          { label:'Total',         value:stats.total,     ring:null,                 color:'' },
          { label:'Envíos',        value:stats.total,     ring:null,                 color:'' },
          { label:'En camino',     value:stats.inTransit, ring:pct(stats.inTransit), color:'#3B82F6' },
          { label:'Entregados',    value:stats.delivered, ring:pct(stats.delivered), color:'#38BDF8' },
          { label:'Pendientes',    value:stats.pending,   ring:null,                 color:'' },
          { label:'No entregados', value:stats.incident,  ring:null,                 color:'' },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ flex:1, padding:'0 14px', borderRight:i<arr.length-1?'1px solid rgba(255,255,255,.08)':'none' }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{s.label}</div>
            {s.ring !== null ? (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <svg width="32" height="32" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="3"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={s.color} strokeWidth="3"
                    strokeDasharray={`${s.ring} ${100-s.ring}`} strokeDashoffset="25" strokeLinecap="round"/>
                  <text x="18" y="22" textAnchor="middle" fill="white" fontSize="9" fontWeight="500">{s.ring}%</text>
                </svg>
                <span style={{ fontSize:20, fontWeight:500, color:'white' }}>{s.value}</span>
              </div>
            ) : (
              <div style={{ fontSize:20, fontWeight:500, color:'white' }}>{s.value}</div>
            )}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <form method="GET" style={{ display:'flex', gap:8, flex:1, flexWrap:'wrap' }}>
          {verTodo && <input type="hidden" name="historial" value="1"/>}
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'white', border:'1px solid #E2E8F0', borderRadius:8, padding:'7px 12px', flex:1, minWidth:200 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="#9CA3AF"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
            <input name="search" defaultValue={searchParams.search} placeholder="Cliente, N° pedido, dirección..."
              style={{ border:'none', outline:'none', fontSize:13, flex:1, fontFamily:'inherit' }}/>
          </div>
          {stores.length > 0 && (
            <select name="storeId" defaultValue={searchParams.storeId ?? ''}
              style={{ padding:'7px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', fontFamily:'inherit' }}>
              <option value="">Todas las tiendas</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select name="status" defaultValue={searchParams.status ?? ''}
            style={{ padding:'7px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', fontFamily:'inherit' }}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="platform" defaultValue={searchParams.platform ?? ''}
            style={{ padding:'7px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, background:'white', fontFamily:'inherit' }}>
            <option value="">Todas las plataformas</option>
            {Object.entries(PLATFORM_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {verTodo && (<>
            <input type="date" name="dateFrom" defaultValue={searchParams.dateFrom}
              style={{ padding:'7px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'inherit' }}/>
            <input type="date" name="dateTo" defaultValue={searchParams.dateTo}
              style={{ padding:'7px 10px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, fontFamily:'inherit' }}/>
          </>)}
          <button type="submit"
            style={{ padding:'7px 14px', background:'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
            Filtrar
          </button>
          {(searchParams.search || searchParams.status || searchParams.platform || searchParams.dateFrom || searchParams.storeId) && (
            <Link href={verTodo ? '/recepciones?historial=1' : '/recepciones'}
              style={{ padding:'7px 12px', border:'1px solid #FECDD3', borderRadius:8, fontSize:13, background:'#FFF1F2', color:'#9F1239', textDecoration:'none' }}>
              × Limpiar
            </Link>
          )}
        </form>
        <div style={{ display:'flex', gap:8 }}>
          <RecepcionesClient
            orders={result.items as any}
            storeName={stores.find(s => s.id === searchParams.storeId)?.name || 'todas-las-tiendas'}
            todayOnly={todayOnly}
          />
          <Link href="/pedidos/nuevo"
            style={{ padding:'7px 14px', background:'#2563EB', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
            + Nuevo
          </Link>
          <Link href="/pedidos/carga-masiva"
            style={{ padding:'7px 14px', background:'#0B1628', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
            ⬆ Excel
          </Link>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden' }}>
        {result.items.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'#9CA3AF' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>{todayOnly ? '📅' : '📦'}</div>
            <div style={{ fontSize:15, fontWeight:500, color:'#374151', marginBottom:6 }}>
              {todayOnly ? 'Sin pedidos hoy todavía' : 'No hay resultados'}
            </div>
            <div style={{ fontSize:13, marginBottom:20 }}>
              {todayOnly ? 'Los pedidos que lleguen hoy aparecerán aquí automáticamente' : 'Prueba cambiando los filtros'}
            </div>
            {todayOnly && (
              <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                <Link href="/pedidos/nuevo" style={{ padding:'8px 18px', background:'#2563EB', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
                  + Crear pedido manual
                </Link>
                <Link href="/recepciones?historial=1" style={{ padding:'8px 18px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, color:'#374151', textDecoration:'none', background:'white' }}>
                  Ver historial
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#F8FAFC' }}>
                  {['N° pedido','Cliente','Teléfono','Dirección','Plataforma','Bultos','Estado','Hora',''].map(h => (
                    <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:500, color:'#6B7280', borderBottom:'1px solid #E2E8F0', textTransform:'uppercase', letterSpacing:'.04em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.items.map(order => {
                  const sc = STATUS_COLOR[order.status] ?? STATUS_COLOR.PENDING
                  return (
                    <tr key={order.id}>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13, fontWeight:500 }}>
                        <Link href={`/recepciones/${order.id}`} style={{ color:'#1D4ED8', textDecoration:'none' }}>
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13 }}>{order.customerName}</td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>{order.customerPhone || '—'}</td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {order.addressStreet}, {order.addressComuna}
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#6B7280' }}>
                        {PLATFORM_LABEL[order.platform] ?? order.platform}
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:13, textAlign:'center' }}>{order.bultos}</td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', whiteSpace:'nowrap' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:sc.bg, color:sc.color }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:sc.color }}/>
                          {STATUS_LABEL[order.status]}
                        </span>
                        {(order as any).evidencePhoto1 && <span style={{ marginLeft:4, fontSize:11 }}>📷</span>}
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9', fontSize:12, color:'#9CA3AF', whiteSpace:'nowrap' }}>
                        {fmtTime(order.createdAt)}
                        {!todayOnly && (
                          <div style={{ fontSize:11 }}>
                            {fmtDate(order.createdAt)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding:'11px 12px', borderBottom:'1px solid #F1F5F9' }}>
                        <Link href={`/recepciones/${order.id}`} style={{ color:'#9CA3AF', fontSize:16, textDecoration:'none' }}>→</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ padding:'12px 16px', borderTop:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:'#6B7280' }}>
              <span>
                Mostrando <strong>{result.items.length}</strong> de <strong>{result.total}</strong> pedido{result.total!==1?'s':''}
                {todayOnly && <span style={{ marginLeft:8, color:'#9CA3AF' }}>· Solo hoy</span>}
              </span>
              {result.totalPages > 1 && (
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span>Página {page} de {result.totalPages}</span>
                  {page > 1 && (
                    <Link href={`?page=${page-1}${verTodo?'&historial=1':''}${searchParams.storeId?`&storeId=${searchParams.storeId}`:''}${searchParams.status?`&status=${searchParams.status}`:''}${searchParams.search?`&search=${searchParams.search}`:''}`}
                      style={{ padding:'4px 10px', border:'1px solid #E2E8F0', borderRadius:6, textDecoration:'none', color:'#374151' }}>←</Link>
                  )}
                  {page < result.totalPages && (
                    <Link href={`?page=${page+1}${verTodo?'&historial=1':''}${searchParams.storeId?`&storeId=${searchParams.storeId}`:''}${searchParams.status?`&status=${searchParams.status}`:''}${searchParams.search?`&search=${searchParams.search}`:''}`}
                      style={{ padding:'4px 10px', border:'1px solid #E2E8F0', borderRadius:6, textDecoration:'none', color:'#374151' }}>→</Link>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
