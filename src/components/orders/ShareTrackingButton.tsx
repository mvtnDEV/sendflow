'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Compartir el link público de seguimiento (/track/<qrCode>) con el cliente final.
 *
 * Usa el qrCode y no el orderNumber: los números de pedido son correlativos y
 * cualquiera podría recorrerlos; el qrCode no se puede adivinar.
 */

interface Props {
  qrCode:         string
  orderNumber:    string
  customerName?:  string | null
  customerPhone?: string | null
  /** 'icon': botón compacto con menú (tablas). 'card': bloque completo (detalle). */
  variant?:       'icon' | 'card'
}

export function trackingUrl(qrCode: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/track/${encodeURIComponent(qrCode)}`
}

/** Normaliza un teléfono chileno al formato que pide wa.me (56 9 XXXX XXXX). */
export function waPhone(raw?: string | null): string | null {
  const d = (raw ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('56') && d.length === 11) return d
  if (d.length === 9 && d.startsWith('9'))  return `56${d}`
  if (d.length === 8)                       return `569${d}`
  return d.length >= 10 ? d : null
}

function saludo(orderNumber: string, customerName?: string | null): string {
  const nombre = customerName?.trim().split(/\s+/)[0]
  return `Hola${nombre ? ` ${nombre}` : ''}! Puedes seguir tu pedido ${orderNumber} aquí:`
}

function useShare({ qrCode, orderNumber, customerName, customerPhone }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const url = trackingUrl(qrCode)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Contexto sin permisos de portapapeles: que el usuario lo copie a mano.
      window.prompt('Copia el link de seguimiento:', url)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function whatsapp() {
    const text  = encodeURIComponent(`${saludo(orderNumber, customerName)} ${trackingUrl(qrCode)}`)
    const phone = waPhone(customerPhone)
    window.open(`https://wa.me/${phone ?? ''}?text=${text}`, '_blank', 'noopener')
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function nativeShare() {
    try {
      await navigator.share({
        title: `Seguimiento pedido ${orderNumber}`,
        text:  saludo(orderNumber, customerName),
        url:   trackingUrl(qrCode),
      })
    } catch {
      // Cancelado por el usuario: no hay nada que hacer.
    }
  }

  return { copied, copy, whatsapp, canNativeShare, nativeShare, hasPhone: !!waPhone(customerPhone) }
}

const itemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left',
  fontSize: 13, color: '#0B1628', cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'inherit',
}

function ShareIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </svg>
  )
}

export default function ShareTrackingButton(props: Props) {
  const share = useShare(props)
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState<{ top: number; right: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Menú con position:fixed para que no lo recorte el contenedor con scroll de la tabla.
  function toggle() {
    if (open) return setOpen(false)
    const r = ref.current?.getBoundingClientRect()
    if (r) {
      const abajo = window.innerHeight - r.bottom > 190
      setPos({ top: abajo ? r.bottom + 4 : r.top - 4 - 180, right: window.innerWidth - r.right })
    }
    setOpen(true)
  }
  // navigator.share solo existe en el cliente: decidir tras montar evita mismatch de hidratación.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const hide = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [open])

  if (props.variant === 'card') {
    const btn: React.CSSProperties = {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      width: '100%', padding: 9, borderRadius: 8, fontSize: 13, fontWeight: 500,
      cursor: 'pointer', fontFamily: 'inherit',
    }
    return (
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
          Seguimiento para el cliente
        </div>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 12px', lineHeight: 1.5 }}>
          Link público donde tu cliente ve el estado del envío.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={share.whatsapp}
            style={{ ...btn, background: '#16A34A', color: 'white', border: 'none' }}>
            💬 Enviar por WhatsApp{share.hasPhone ? '' : ' (elegir contacto)'}
          </button>
          <button type="button" onClick={share.copy}
            style={{ ...btn, background: share.copied ? '#F0FDF4' : 'white', color: share.copied ? '#166534' : '#0B1628', border: '1px solid #E2E8F0' }}>
            {share.copied ? '✓ Link copiado' : '🔗 Copiar link'}
          </button>
          {mounted && share.canNativeShare && (
            <button type="button" onClick={share.nativeShare}
              style={{ ...btn, background: 'white', color: '#0B1628', border: '1px solid #E2E8F0' }}>
              <ShareIcon /> Más opciones
            </button>
          )}
          <a href={`/track/${encodeURIComponent(props.qrCode)}`} target="_blank" rel="noopener"
            style={{ fontSize: 12, color: '#2563EB', textAlign: 'center', textDecoration: 'none', marginTop: 2 }}>
            Ver como lo ve el cliente ↗
          </a>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        title="Compartir seguimiento"
        aria-label={`Compartir seguimiento del pedido ${props.orderNumber}`}
        aria-expanded={open}
        onClick={toggle}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 30, borderRadius: 6, cursor: 'pointer',
          background: share.copied ? '#F0FDF4' : '#F1F5F9',
          color: share.copied ? '#166534' : '#475569',
          border: '1px solid #E2E8F0',
        }}
      >
        {share.copied ? '✓' : <ShareIcon />}
      </button>
      {open && pos && (
        <div role="menu" style={{
          position: 'fixed', right: pos.right, top: pos.top, zIndex: 1000,
          background: 'white', border: '1px solid #E2E8F0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,.12)', padding: 4, minWidth: 200,
        }}>
          <button type="button" role="menuitem" style={itemStyle}
            onClick={() => { share.whatsapp(); setOpen(false) }}>
            💬 Enviar por WhatsApp
          </button>
          <button type="button" role="menuitem" style={itemStyle}
            onClick={() => { share.copy(); setOpen(false) }}>
            🔗 Copiar link
          </button>
          {mounted && share.canNativeShare && (
            <button type="button" role="menuitem" style={itemStyle}
              onClick={() => { share.nativeShare(); setOpen(false) }}>
              <ShareIcon size={13} /> Más opciones
            </button>
          )}
          <a role="menuitem" href={`/track/${encodeURIComponent(props.qrCode)}`} target="_blank" rel="noopener"
            style={{ ...itemStyle, textDecoration: 'none', color: '#2563EB' }}
            onClick={() => setOpen(false)}>
            ↗ Ver página de seguimiento
          </a>
        </div>
      )}
    </div>
  )
}
