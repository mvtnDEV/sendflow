export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getSessionUser, canAccessStore } from '@/lib/utils/auth'
import { prisma } from '@/lib/db/prisma'
import Link from 'next/link'
import OrderActions from '@/components/orders/OrderActions'

const TZ = 'America/Santiago'
const fmt = (d: Date | string) => new Date(d).toLocaleString('es-CL', { timeZone: TZ, day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })

const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pedido creado',
  RECEIVED:   'Recepcionado en bodega',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'No entregado',
  CANCELLED:  'Cancelado',
}
const PLATFORM_LABEL: Record<string, string> = {
  SHOPIFY:      'Shopify',
  MERCADOLIBRE: 'ML Flex',
  WOOCOMMERCE:  'WooCommerce',
  JUMPSELLER:   'Jumpseller',
  MANUAL:       'Manual',
}

function formatRawStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function getPlatformStatus(platform: string, rawPayload: any): string | null {
  if (!rawPayload) return null
  const status = rawPayload.status ?? rawPayload.financial_status ?? null
  if (!status) return null
  return formatRawStatus(status)
}

const NOTAS_INTERNAS = ['envios now', 'enviame', 'enviosnow', 'now:', 'id now', 'delivery id']

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const user  = await getSessionUser()
  const order = await prisma.order.findUnique({
    where:   { id: params.id },
    include: {
      store:  { select: { id: true, name: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!order) notFound()
  if (!canAccessStore(user!, order.storeId)) redirect('/recepciones')

  const isStoreAdmin = user?.role === 'STORE_ADMIN'

  const statusBadge: Record<string, { bg: string; color: string }> = {
    PENDING:    { bg:'rgba(245,158,11,0.1)',  color:'#FCD34D' },
    RECEIVED:   { bg:'rgba(59,130,246,0.1)',  color:'#93C5FD' },
    IN_TRANSIT: { bg:'rgba(99,102,241,0.1)',  color:'#A5B4FC' },
    DELIVERED:  { bg:'rgba(16,185,129,0.1)',  color:'#6EE7B7' },
    INCIDENT:   { bg:'rgba(239,68,68,0.1)',   color:'#FCA5A5' },
    CANCELLED:  { bg:'rgba(107,114,128,0.1)', color:'#9CA3AF' },
  }

  const sc             = statusBadge[order.status] ?? statusBadge.PENDING
  const subStoreName   = (order as any).subStoreName as string | null
  const platformStatus = isStoreAdmin ? getPlatformStatus(order.platform, order.rawPayload) : null

  const visibleEvents = order.events.filter(ev => {
    if (!isStoreAdmin) return true
    if (ev.note && NOTAS_INTERNAS.some(n => ev.note!.toLowerCase().includes(n))) return false
    return true
  })

  const rows = [
    ['N° pedido',  order.orderNumber],
    ['Tienda',     `${order.store.name} · ${PLATFORM_LABEL[order.platform] ?? order.platform}`],
    ...(subStoreName ? [['Sub-tienda', subStoreName]] : []),
    ['Cliente',    order.customerName],
    ['Teléfono',   order.customerPhone ?? '—'],
    ['Email',      order.customerEmail ?? '—'],
    ['Dirección',  order.addressStreet],
    ['Comuna',     order.addressComuna],
    ['Región',     order.addressRegion],
    ['Bultos',     String(order.bultos)],
    ['Creado',     fmt(order.createdAt)],
    ...(order.receivedAt  ? [['Recepcionado', fmt(order.receivedAt)]]  : []),
    ...(order.inTransitAt ? [['En camino',    fmt(order.inTransitAt)]] : []),
    ...(order.deliveredAt ? [['Entregado',    fmt(order.deliveredAt)]] : []),
  ]

  return (
    <div style={{ maxWidth:900, margin:'0 auto' }}>
      <style>{`
        @media (max-width: 768px) {
          .detail-grid { grid-template-columns: 1fr !important; }
          .detail-header { flex-wrap: wrap; gap: 8px; }
          .print-btn { margin-left: 0 !important; width: 100%; justify-content: center; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="detail-header" style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <Link href="/recepciones" style={{ color:'var(--text-muted)', textDecoration:'none', fontSize:13, display:'flex', alignItems:'center', gap:4 }}>
          ← Recepciones
        </Link>
        <h1 style={{ fontSize:20, fontWeight:600, color:'var(--text-primary)', margin:0 }}>{order.orderNumber}</h1>
        <span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:500, background:sc.bg, color:sc.color }}>
          {STATUS_LABEL[order.status]}
        </span>
        {subStoreName && (
          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:500, background:'rgba(245,158,11,0.1)', color:'#FCD34D', border:'1px solid rgba(245,158,11,0.2)' }}>
            {subStoreName}
          </span>
        )}
        <a href={`/api/labels/${order.id}`} target="_blank" className="print-btn"
          style={{ marginLeft:'auto', padding:'7px 14px', background:'var(--accent)', color:'white', borderRadius:8, fontSize:12, fontWeight:500, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>
          🖨 Imprimir etiqueta
        </a>
      </div>

      <div className="detail-grid" style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16 }}>
        <div>

          {/* ── Datos del pedido ── */}
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14 }}>
              Datos del pedido
            </div>
            {rows.map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'9px 0', borderBottom:'1px solid var(--border)', fontSize:13, gap:12 }}>
                <span style={{ color:'var(--text-muted)', flexShrink:0 }}>{label}</span>
                <span style={{ fontWeight:500, color:'var(--text-primary)', textAlign:'right', wordBreak:'break-word' }}>{value}</span>
              </div>
            ))}
            {platformStatus && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', fontSize:13 }}>
                <span style={{ color:'var(--text-muted)' }}>Estado en {PLATFORM_LABEL[order.platform]}</span>
                <span style={{ padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:500, background:'rgba(99,102,241,0.1)', color:'#A5B4FC' }}>
                  {platformStatus}
                </span>
              </div>
            )}
          </div>

          {/* ── Evidencia ── */}
          {order.evidencePhoto1 && (
            <div style={{ background:'var(--bg-card)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:12, padding:20, marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#6EE7B7', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
                📷 Evidencia de entrega
                {order.evidenceTakenAt && (
                  <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:400, marginLeft:'auto' }}>{fmt(order.evidenceTakenAt)}</span>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:order.evidencePhoto2?'1fr 1fr':'1fr', gap:12, marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:5 }}>Foto 1</div>
                  <a href={order.evidencePhoto1} target="_blank">
                    <img src={order.evidencePhoto1} alt="Evidencia 1" style={{ width:'100%', borderRadius:8, border:'1px solid var(--border)', maxHeight:200, objectFit:'cover', cursor:'pointer' }}/>
                  </a>
                </div>
                {order.evidencePhoto2 && (
                  <div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:5 }}>Foto 2</div>
                    <a href={order.evidencePhoto2} target="_blank">
                      <img src={order.evidencePhoto2} alt="Evidencia 2" style={{ width:'100%', borderRadius:8, border:'1px solid var(--border)', maxHeight:200, objectFit:'cover', cursor:'pointer' }}/>
                    </a>
                  </div>
                )}
              </div>
              {order.evidenceNote && (
                <div style={{ background:'rgba(16,185,129,0.1)', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#6EE7B7' }}>
                  💬 {order.evidenceNote}
                </div>
              )}
            </div>
          )}

          {/* ── Timeline ── */}
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:16 }}>
              Historial
            </div>
            <div style={{ position:'relative', paddingLeft:24 }}>
              <div style={{ position:'absolute', left:8, top:0, bottom:0, width:1, background:'var(--border)' }}/>
              {visibleEvents.map((ev, i) => {
                const isLast = i === visibleEvents.length - 1
                return (
                  <div key={ev.id} style={{ position:'relative', paddingBottom:isLast?0:20 }}>
                    <div style={{ position:'absolute', left:-20, top:2, width:16, height:16, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                        <polyline points="1 5 4 8 9 2"/>
                      </svg>
                    </div>
                    <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)' }}>{STATUS_LABEL[ev.status] ?? ev.status}</div>
                    {ev.note && !NOTAS_INTERNAS.some(n => ev.note!.toLowerCase().includes(n)) && (
                      <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:1 }}>{ev.note}</div>
                    )}
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                      {fmt(ev.createdAt)}
                      {!isStoreAdmin && ev.createdBy && ev.createdBy !== 'system' && ev.createdBy !== 'webhook' && ev.createdBy !== 'enviosnow-webhook' && ` · ${ev.createdBy}`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div>
          {/* ── QR ── */}
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginBottom:14, textAlign:'center' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14, textAlign:'left' }}>
              Etiqueta / QR
            </div>
            <div style={{ width:140, height:140, background:'var(--bg-base)', borderRadius:8, margin:'0 auto 12px', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 80 80" width="100" height="100" fill="var(--text-primary)">
                <rect x="5" y="5" width="28" height="28" fill="none" stroke="var(--text-primary)" strokeWidth="3"/>
                <rect x="11" y="11" width="16" height="16"/>
                <rect x="47" y="5" width="28" height="28" fill="none" stroke="var(--text-primary)" strokeWidth="3"/>
                <rect x="53" y="11" width="16" height="16"/>
                <rect x="5" y="47" width="28" height="28" fill="none" stroke="var(--text-primary)" strokeWidth="3"/>
                <rect x="11" y="53" width="16" height="16"/>
                <rect x="47" y="47" width="5" height="5"/><rect x="56" y="47" width="5" height="5"/>
                <rect x="65" y="47" width="10" height="5"/><rect x="47" y="56" width="10" height="5"/>
                <rect x="62" y="56" width="13" height="5"/><rect x="47" y="65" width="5" height="10"/>
                <rect x="56" y="65" width="19" height="5"/><rect x="70" y="65" width="5" height="10"/>
              </svg>
            </div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', marginBottom:2 }}>{order.orderNumber}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:14, fontFamily:'monospace', wordBreak:'break-all' }}>{order.qrCode}</div>
            <a href={`/api/labels/${order.id}`} target="_blank"
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, width:'100%', padding:'9px', background:'var(--accent)', color:'white', borderRadius:8, textDecoration:'none', fontSize:13, fontWeight:500 }}>
              🖨 Imprimir etiqueta
            </a>
          </div>

          {/* ── Estado ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {order.status === 'DELIVERED' && (
              <div style={{ background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:20, marginBottom:4 }}>✅</div>
                <div style={{ fontSize:14, fontWeight:500, color:'#6EE7B7' }}>Pedido entregado</div>
                {order.deliveredAt && <div style={{ fontSize:12, color:'#34D399', marginTop:4 }}>{fmt(order.deliveredAt)}</div>}
                <div style={{ fontSize:12, color:'#34D399', marginTop:4 }}>
                  {order.evidencePhoto1 ? '📷 Con evidencia fotográfica' : '⚠ Sin evidencia'}
                </div>
              </div>
            )}
            {order.status === 'INCIDENT' && (
              <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:20, marginBottom:4 }}>❌</div>
                <div style={{ fontSize:14, fontWeight:500, color:'#FCA5A5' }}>No entregado</div>
                <div style={{ fontSize:12, color:'#FCA5A5', marginTop:4 }}>Puedes reintentar la entrega desde las acciones</div>
              </div>
            )}
            {order.status === 'CANCELLED' && (
              <div style={{ background:'rgba(107,114,128,0.1)', border:'1px solid rgba(107,114,128,0.3)', borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:20, marginBottom:4 }}>🚫</div>
                <div style={{ fontSize:14, fontWeight:500, color:'#9CA3AF' }}>Pedido anulado</div>
              </div>
            )}
            <OrderActions orderId={order.id} currentStatus={order.status} userRole={user?.role ?? ''} />
          </div>
        </div>
      </div>
    </div>
  )
}
