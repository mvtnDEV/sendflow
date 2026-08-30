import Link from 'next/link'
import { cache } from 'react'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import type { OrderStatus } from '@prisma/client'
import { getPublicTracking, STATUS_LABEL } from '@/lib/services/tracking.service'
import { checkRateLimit, clientIp }        from '@/lib/utils/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_POR_MINUTO = 30

// generateMetadata y la página piden el mismo pedido: una sola consulta.
const buscar = cache((codigo: string) => getPublicTracking(decodeURIComponent(codigo)))

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING:    '#64748B',
  RECEIVED:   '#F59E0B',
  DISPATCHED: '#F59E0B',
  PICKED_UP:  '#F59E0B',
  IN_TRANSIT: '#2563EB',
  DELIVERED:  '#38BDF8',
  INCIDENT:   '#EF4444',
  CANCELLED:  '#EF4444',
}

const STATUS_ICON: Record<OrderStatus, string> = {
  PENDING:    '📝',
  RECEIVED:   '📦',
  DISPATCHED: '📦',
  PICKED_UP:  '📦',
  IN_TRANSIT: '🚚',
  DELIVERED:  '✅',
  INCIDENT:   '⚠️',
  CANCELLED:  '⚠️',
}

const STATUS_HELP: Record<OrderStatus, string> = {
  PENDING:    'Ya tenemos los datos de tu pedido. Pronto entra a bodega.',
  RECEIVED:   'Tu pedido está en nuestra bodega, listo para salir a reparto.',
  DISPATCHED: 'Tu pedido está preparado para salir a reparto.',
  PICKED_UP:  'Tu pedido está preparado para salir a reparto.',
  IN_TRANSIT: 'Tu pedido va en camino a la dirección de entrega.',
  DELIVERED:  '¡Tu pedido fue entregado!',
  INCIDENT:   'Hubo un problema con la entrega. La tienda se contactará contigo.',
  CANCELLED:  'Este pedido fue cancelado.',
}

// Los 4 pasos que ve el cliente. DISPATCHED/PICKED_UP caen dentro de "En bodega".
const PASOS = ['Pedido creado', 'En bodega', 'En camino', 'Entregado']

/**
 * El avance sale de las marcas de tiempo, no del estado: así un pedido con
 * incidencia que ya iba en camino no aparece como si nunca hubiese salido.
 */
function pasoActual(d: { deliveredAt: string | null; inTransitAt: string | null; receivedAt: string | null }): number {
  if (d.deliveredAt)  return 3
  if (d.inTransitAt)  return 2
  if (d.receivedAt)   return 1
  return 0
}

export async function generateMetadata(
  { params }: { params: { codigo: string } },
): Promise<Metadata> {
  const data = await buscar(params.codigo)
  if (!data) {
    return { title: 'Pedido no encontrado · Moovex' }
  }
  return {
    title:       `Pedido ${data.orderNumber} · ${STATUS_LABEL[data.status]} · Moovex`,
    description: STATUS_HELP[data.status],
    openGraph: {
      title:       `Pedido ${data.orderNumber} · ${STATUS_LABEL[data.status]}`,
      description: STATUS_HELP[data.status],
      siteName:    'Moovex',
    },
  }
}

const CARD: React.CSSProperties = {
  background: '#111F35',
  border: '1px solid #1E2F4A',
  borderRadius: 14,
  padding: 20,
  marginBottom: 14,
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div style={{ ...CARD, textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>🔍</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: 'white' }}>{titulo}</div>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: '8px 0 20px', lineHeight: 1.5 }}>{texto}</p>
      <Link
        href="/track"
        style={{
          display: 'inline-block', padding: '11px 20px', background: '#2563EB',
          color: 'white', borderRadius: 10, fontSize: 14, fontWeight: 500, textDecoration: 'none',
        }}
      >
        Buscar otro pedido
      </Link>
    </div>
  )
}

export default async function TrackPage({ params }: { params: { codigo: string } }) {
  // La página server-rendered es tan enumerable como la API: mismo límite.
  const permitido = await checkRateLimit(`track:${clientIp(headers())}`, MAX_POR_MINUTO, 60)
  if (!permitido) {
    return (
      <Aviso
        titulo="Demasiadas consultas"
        texto="Espera un minuto antes de volver a buscar."
      />
    )
  }

  const data = await buscar(params.codigo)

  // Mismo mensaje para "no existe" y "no autorizado"
  if (!data) {
    return (
      <Aviso
        titulo="Pedido no encontrado"
        texto="Revisa que el código esté bien escrito. Si acabas de comprar, puede que aún no esté registrado."
      />
    )
  }

  const color  = STATUS_COLOR[data.status]
  const actual = pasoActual(data)
  const fechaDePaso = [data.createdAt, data.receivedAt, data.inTransitAt, data.deliveredAt]

  return (
    <>
      {/* Estado actual */}
      <div style={{ ...CARD, textAlign: 'center', paddingTop: 26, paddingBottom: 24 }}>
        <div style={{ fontSize: 42, lineHeight: 1 }}>{STATUS_ICON[data.status]}</div>
        <div style={{ fontSize: 19, fontWeight: 600, color, marginTop: 12 }}>
          {STATUS_LABEL[data.status]}
        </div>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '8px auto 0', maxWidth: 320, lineHeight: 1.5 }}>
          {STATUS_HELP[data.status]}
        </p>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 16 }}>
          Pedido <span style={{ color: '#CBD5E1', fontWeight: 500 }}>{data.orderNumber}</span>
        </div>
      </div>

      {/* Datos del envío */}
      <div style={CARD}>
        <Dato label="Destinatario" valor={data.customerName} />
        <Dato label="Comuna de entrega" valor={data.comuna} />
        <Dato label="Bultos" valor={String(data.bultos)} />
        {data.receptorName && <Dato label="Recibido por" valor={data.receptorName} />}
      </div>

      {/* Progreso */}
      {data.status !== 'CANCELLED' && (
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'white', marginBottom: 16 }}>Progreso</div>
          {PASOS.map((paso, i) => {
            const hecho    = i <= actual
            const esActual = i === actual
            return (
              <div key={paso} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Punto + línea */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
                  <div
                    style={{
                      width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                      background: hecho ? color : 'transparent',
                      border: `2px solid ${hecho ? color : '#2A3E5C'}`,
                    }}
                  />
                  {i < PASOS.length - 1 && (
                    <div style={{ width: 2, flex: 1, minHeight: 26, background: i < actual ? color : '#1E2F4A' }} />
                  )}
                </div>
                <div style={{ paddingBottom: i < PASOS.length - 1 ? 14 : 0 }}>
                  <div style={{ fontSize: 14, color: hecho ? '#E2E8F0' : '#475569', fontWeight: esActual ? 600 : 400 }}>
                    {paso}
                  </div>
                  {hecho && fechaDePaso[i] && (
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{fechaDePaso[i]}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Evidencia de entrega */}
      {data.evidencePhoto1 && (
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'white', marginBottom: 12 }}>Prueba de entrega</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.evidencePhoto1}
            alt="Foto de la entrega"
            style={{ width: '100%', borderRadius: 10, display: 'block', border: '1px solid #1E2F4A' }}
          />
        </div>
      )}

      {/* Historial */}
      {data.timeline.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'white', marginBottom: 14 }}>Historial</div>
          {data.timeline.map((ev, i) => (
            <div
              key={i}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                fontSize: 12, padding: '7px 0',
                borderTop: i === 0 ? 'none' : '1px solid #1A2A42',
              }}
            >
              <span style={{ color: '#CBD5E1' }}>{ev.text}</span>
              <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>{ev.formatted}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <Link href="/track" style={{ fontSize: 13, color: '#64748B', textDecoration: 'none' }}>
          Buscar otro pedido
        </Link>
      </div>
    </>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', fontSize: 13 }}>
      <span style={{ color: '#64748B' }}>{label}</span>
      <span style={{ color: '#E2E8F0', textAlign: 'right' }}>{valor}</span>
    </div>
  )
}
