'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import s from './track.module.css'

/** Compartir el seguimiento: menú nativo en el celular, copiar link en escritorio. */
export function ShareButton({ orderNumber }: { orderNumber: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = window.location.href
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Pedido ${orderNumber} · Moovex`, url })
        return
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copia el link de seguimiento:', url)
    }
  }

  return (
    <button type="button" className={s.btn} onClick={share}>
      {copied ? (
        <>✓ Link copiado</>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Compartir
        </>
      )}
    </button>
  )
}

/**
 * Vuelve a pedir la página cada minuto mientras el pedido siga en curso, para
 * que quien la deja abierta vea el cambio de estado sin recargar. Se pausa con
 * la pestaña oculta (no gasta el rate limit de nadie).
 */
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, everyMs)
    return () => clearInterval(id)
  }, [router, everyMs])
  return null
}
