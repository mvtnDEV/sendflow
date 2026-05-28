export const dynamic = 'force-dynamic'
import { getSessionUser } from '@/lib/utils/auth'
import { listOrders, getDashboardStats } from '@/lib/services/order.service'
import { prisma } from '@/lib/db/prisma'
import Link from 'next/link'
import RecepcionesClient from './client'

const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pendiente',
  RECEIVED:   'Recepcionado',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'No entregado',
}
const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:      'Shopify',
  MERCADOLIBRE: 'ML Flex',
  WOOCOMMERCE:  'WooCommerce',
  JUMPSELLER:   'Jumpseller',
  MANUAL:       'Manual',
}

const TZ = 'America/Santiago'

interface Props {
  searchParams: {
    status?: string; search?: string; platform?: string
    dateFrom?: string; dateTo?: string; historial?: string
    page?: string; storeId?: string; pageSize?: string
  }
}

export default async function RecepcionesPage({ searchParams }: Props) {
  const user        = await getSessionUser()
  const userStoreId = user?.role === 'STORE_ADMIN' ? (user?.storeId ?? undefined) : undefined
  const filterStore = userStoreId || searchParams.storeId || undefined
  const page        = Number(searchParams.page ?? 1)
  const pageSize    = Number(searchParams.pageSize ?? 50)
  const verTodo     = searchParams.historial === '1'
  const todayOnly   = !verTodo && !searchParams.dateFrom && !searchParams.dateTo
  const today       = new Date()
  const todayStr    = today.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', timeZone: TZ })
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [stats, result, stores] = await Promise.all([
    getDashboardStats(filterStore, todayOnly),
    listOrders({
      storeId:        filterStore,
      status:         searchParams.status,
      search:         searchParams.search,
      platform:       searchParams.platform,
      dateFrom:       searchParams.dateFrom,
      dateTo:         searchParams.dateTo,
      todayOnly,
      page,
      pageSize,
      superAdminView: isSuperAdmin,
    }),
    isSuperAdmin
      ? prisma.store.findMany({ select: { id:true, name:true }, orderBy: { name:'asc' } })
      : Promise.resolve([]),
  ])

  const pct = (n: number) => stats.total > 0 ? Math.round((n / stats.total) * 100) : 0

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)', margin:0 }}>
            {todayOnly ? 'Pedidos de hoy' : verTodo ? 'Todos los pedidos' : 'Pedidos filtrados'}
          </h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>
            {todayOnly
              ? `${todayStr} · ${stats.total} pedido${stats.total!==1?'s':''}`
              : `${result.total} pedido${result.total!==1?'s':''} encontrados`}
          </p>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <Link href="/recepciones" style={{
            padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:500, textDecoration:'none',
            background: todayOnly ? 'var(--accent)' : 'var(--bg-card)',
            color:      todayOnly ? 'white' : 'var(--text-muted)',
            border:     `1px solid ${todayOnly ? 'var(--accent)' : 'var(--border)'}`,
          }}>Hoy</Link>
          <Link href="/recepciones?historial=1" style={{
            padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:500, textDecoration:'none',
            background: verTodo ? 'var(--accent)' : 'var(--bg-card)',
            color:      verTodo ? 'white' : 'var(--text-muted)',
            border:     `1px solid ${verTodo ? 'var(--accent)' : 'var(--border)'}`,
          }}>Ver historial completo</Link>
        </div>
      </div>

      {/* ── Stat bar ── */}
      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 20px', display:'flex', marginBottom:16, overflowX:'auto' }}>
        {[
          { label:'Total',         value:stats.total,     ring:null,                 color:'' },
          { label:'Envíos',        value:stats.total,     ring:null,                 color:'' },
          { label:'En camino',     value:stats.inTransit, ring:pct(stats.inTransit), color:'#6366F1' },
          { label:'Entregados',    value:stats.delivered, ring:pct(stats.delivered), color:'#10B981' },
          { label:'Pendientes',    value:stats.pending,   ring:null,                 color:'' },
          { label:'No entregados', value:stats.incident,  ring:null,                 color:'' },
        ].map((s, i, arr) => (
          <div key={s.label} style={{ flex:1, padding:'0 14px', borderRight:i<arr.length-1?'1px solid var(--border)':'none', minWidth:80 }}>
            <div style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{s.label}</div>
            {s.ring !== null ? (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <svg width="32" height="32" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={s.color} strokeWidth="3"
                    strokeDasharray={`${s.ring} ${100-s.ring}`} strokeDashoffset="25" strokeLinecap="round"/>
                  <text x="18" y="22" textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontWeight="500">{s.ring}%</text>
                </svg>
                <span style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)' }}>{s.value}</span>
              </div>
            ) : (
              <div style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)' }}>{s.value}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'flex-start' }}>
        <form method="GET" style={{ display:'flex', gap:8, flex:1, flexWrap:'wrap' }}>
          {verTodo && <input type="hidden" name="historial" value="1"/>}
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 12px', flex:1, minWidth:200 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="var(--text-muted)"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
            <input name="search" defaultValue={searchParams.search} placeholder="Cliente, N° pedido, dirección..."
              style={{ border:'none', outline:'none', fontSize:13, flex:1, fontFamily:'inherit', background:'transparent', color:'var(--text-primary)' }}/>
          </div>
          {stores.length > 0 && (
            <select name="storeId" defaultValue={searchParams.storeId ?? ''}
              style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', fontFamily:'inherit', color:'var(--text-primary)' }}>
              <option value="">Todas las tiendas</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <select name="status" defaultValue={searchParams.status ?? ''}
            style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', fontFamily:'inherit', color:'var(--text-primary)' }}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="platform" defaultValue={searchParams.platform ?? ''}
            style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', fontFamily:'inherit', color:'var(--text-primary)' }}>
            <option value="">Todas las plataformas</option>
            {Object.entries(PLATFORM_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="pageSize" defaultValue={String(pageSize)}
            style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, background:'var(--bg-input)', fontFamily:'inherit', color:'var(--text-primary)' }}>
            <option value="25">25 por página</option>
            <option value="50">50 por página</option>
            <option value="100">100 por página</option>
            <option value="200">200 por página</option>
          </select>
          {verTodo && (<>
            <input type="date" name="dateFrom" defaultValue={searchParams.dateFrom}
              style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, fontFamily:'inherit', background:'var(--bg-input)', color:'var(--text-primary)' }}/>
            <input type="date" name="dateTo" defaultValue={searchParams.dateTo}
              style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, fontFamily:'inherit', background:'var(--bg-input)', color:'var(--text-primary)' }}/>
          </>)}
          <button type="submit"
            style={{ padding:'7px 14px', background:'var(--accent)', color:'white', border:'none', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
            Filtrar
          </button>
          {(searchParams.search || searchParams.status || searchParams.platform || searchParams.dateFrom || searchParams.storeId) && (
            <Link href={verTodo ? '/recepciones?historial=1' : '/recepciones'}
              style={{ padding:'7px 12px', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, fontSize:13, background:'rgba(239,68,68,0.1)', color:'#FCA5A5', textDecoration:'none' }}>
              × Limpiar
            </Link>
          )}
        </form>
        <div style={{ display:'flex', gap:8 }}>
          <Link href="/pedidos/nuevo"
            style={{ padding:'7px 14px', background:'var(--accent)', color:'white', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
            + Nuevo
          </Link>
          <Link href="/pedidos/carga-masiva"
            style={{ padding:'7px 14px', background:'var(--bg-card)', color:'var(--text-secondary)', border:'1px solid var(--border)', borderRadius:8, fontSize:13, fontWeight:500, textDecoration:'none' }}>
            ⬆ Excel
          </Link>
        </div>
      </div>

      <RecepcionesClient
        orders={result.items as any}
        storeName={stores.find(s => s.id === searchParams.storeId)?.name || 'todas-las-tiendas'}
        todayOnly={todayOnly}
        total={result.total}
        page={page}
        totalPages={result.totalPages}
        userRole={user?.role ?? ''}
        searchParams={{
          historial: searchParams.historial,
          storeId:   searchParams.storeId,
          status:    searchParams.status,
          search:    searchParams.search,
          platform:  searchParams.platform,
          dateFrom:  searchParams.dateFrom,
          dateTo:    searchParams.dateTo,
          pageSize:  String(pageSize),
        }}
      />
    </div>
  )
}
