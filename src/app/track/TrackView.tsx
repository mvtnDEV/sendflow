import Link from 'next/link'
import type { OrderStatus } from '@prisma/client'
import { STATUS_LABEL, type PublicTracking } from '@/lib/services/tracking.service'
import { ShareButton, AutoRefresh } from './TrackClient'
import s from './track.module.css'

const LIME   = '#a3e635'
const WARN   = '#fbbf24'
const DANGER = '#f87171'
const MUTED  = '#8a93a1'

/** Color de acento de toda la página según el estado. */
const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING:    LIME,
  RECEIVED:   LIME,
  DISPATCHED: LIME,
  PICKED_UP:  LIME,
  IN_TRANSIT: LIME,
  DELIVERED:  LIME,
  INCIDENT:   WARN,
  CANCELLED:  MUTED,
}

export const STATUS_HELP: Record<OrderStatus, string> = {
  PENDING:    'Ya tenemos los datos de tu pedido. Pronto entra a bodega.',
  RECEIVED:   'Tu pedido está en nuestra bodega, listo para salir a reparto.',
  DISPATCHED: 'Tu pedido está preparado para salir a reparto.',
  PICKED_UP:  'Tu pedido está preparado para salir a reparto.',
  IN_TRANSIT: 'Tu pedido va en camino a la dirección de entrega. Mantente atento a tu teléfono.',
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

export function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className={s.hero}>
      <span className={s.eyebrow}>Seguimiento</span>
      <h1 className={s.status} style={{ color: '#fff' }}>{titulo}</h1>
      <p className={s.help}>{texto}</p>
      <div className={s.actions} style={{ marginTop: 24 }}>
        <Link href="/track" className={s.btn}>Buscar otro pedido</Link>
      </div>
    </section>
  )
}

/** "02 oct 2026, 08:05" → { dia: "02 oct", hora: "08:05" } para la ruta, donde el ancho es poco. */
function diaYHora(f: string): { dia: string; hora: string } {
  const m = f.match(/^(\d{1,2}[\s-]\S+)\D+\d{4},?\s*(\d{1,2}:\d{2})/)
  return m ? { dia: m[1], hora: m[2] } : { dia: f, hora: '' }
}

/** Vista del pedido. Separada de la página para poder previsualizarla sin base de datos. */
export function TrackView({ data }: { data: PublicTracking }) {
  const tone      = STATUS_TONE[data.status]
  const actual    = pasoActual(data)
  const fechas    = [data.createdAt, data.receivedAt, data.inTransitAt, data.deliveredAt]
  const eventos   = [...data.timeline].reverse()
  const ultima    = eventos[0]?.formatted ?? data.createdAt
  const enCurso   = !['DELIVERED', 'CANCELLED'].includes(data.status)
  const fotos     = [data.evidencePhoto1, data.evidencePhoto2].filter((f): f is string => !!f)
  const toneStyle = { ['--tone' as string]: tone } as React.CSSProperties

  return (
    <div style={toneStyle}>
      {enCurso && <AutoRefresh />}

      {/* Estado actual */}
      <section className={s.hero} aria-live="polite">
        <span className={s.eyebrow}>
          {enCurso && <span className={s.liveDot} aria-hidden />}
          {enCurso ? 'En curso' : 'Estado final'}
          {ultima && <> · <span className={s.mono} style={{ textTransform: 'none' }}>act. {ultima}</span></>}
        </span>
        <h1 className={s.status}>{STATUS_LABEL[data.status]}</h1>
        <p className={s.help}>{STATUS_HELP[data.status]}</p>
        <div className={s.orderChip}>
          Pedido <strong className={s.mono}>{data.orderNumber}</strong>
        </div>
      </section>

      {/* Avisos de estados especiales */}
      {data.status === 'INCIDENT' && (
        <div className={s.notice} role="status">
          <svg className={s.noticeIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <strong>No pudimos completar la entrega</strong>
            No te preocupes: tu pedido sigue con nosotros. La tienda se pondrá en contacto para coordinar un nuevo intento.
          </div>
        </div>
      )}
      {data.status === 'CANCELLED' && (
        <div className={s.notice} role="status">
          <div>
            <strong>Pedido cancelado</strong>
            Si no esperabas esta cancelación, contacta a la tienda donde compraste.
          </div>
        </div>
      )}

      {/* Ruta de progreso */}
      {data.status !== 'CANCELLED' && (
        <section className={s.card} aria-label="Progreso del envío">
          <ol className={s.route} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {PASOS.map((paso, i) => {
              const hecho    = i < actual || (i === actual && data.status === 'DELIVERED')
              const esActual = i === actual && !hecho
              const cls = [s.stop, hecho && s.stopDone, esActual && s.stopCurrent].filter(Boolean).join(' ')
              return (
                <li key={paso} className={cls} aria-current={esActual ? 'step' : undefined}>
                  <span className={s.dot}>
                    {hecho && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="2 6.5 5 9 10 3" />
                      </svg>
                    )}
                  </span>
                  <span className={s.stopLabel}>{paso}</span>
                  {(hecho || esActual) && fechas[i] && (
                    <span className={`${s.stopDate} ${s.mono}`}>
                      {diaYHora(fechas[i]!).dia}<br />{diaYHora(fechas[i]!).hora}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* Entrega */}
      {data.status === 'DELIVERED' && (data.receptorName || fotos.length > 0) && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Prueba de entrega</h2>
          {data.receptorName && (
            <p style={{ margin: fotos.length ? '0 0 14px' : 0, fontSize: 15 }}>
              Recibido por <strong style={{ color: '#fff' }}>{data.receptorName}</strong>
              {data.deliveredAt && <span className={s.mono} style={{ color: MUTED, fontSize: 12 }}> · {data.deliveredAt}</span>}
            </p>
          )}
          {fotos.length > 0 && (
            <div className={s.photos}>
              {fotos.map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer" className={s.photo}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Foto ${i + 1} de la entrega`} loading="lazy" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Datos del envío */}
      <section className={s.card}>
        <h2 className={s.cardTitle}>Detalle del envío</h2>
        <dl className={s.facts}>
          <div><dt>Destinatario</dt><dd>{data.customerName}</dd></div>
          <div><dt>Comuna</dt><dd>{data.comuna || '—'}</dd></div>
          <div><dt>Bultos</dt><dd className={s.mono}>{data.bultos}</dd></div>
          <div><dt>Ingresado</dt><dd className={s.mono} style={{ fontSize: 13 }}>{data.createdAt ?? '—'}</dd></div>
        </dl>
      </section>

      {/* Historial */}
      {eventos.length > 0 && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Historial</h2>
          <ol className={s.timeline}>
            {eventos.map((ev, i) => (
              <li key={i} className={s.event}>
                <span className={s.eventText}>{ev.text}</span>
                <span className={`${s.eventDate} ${s.mono}`}>{ev.formatted}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className={s.actions}>
        <ShareButton orderNumber={data.orderNumber} />
        <Link href="/track" className={s.btnGhost}>Buscar otro pedido</Link>
      </div>

      {enCurso && <p className={s.refreshNote}>Esta página se actualiza sola cada minuto.</p>}
    </div>
  )
}
