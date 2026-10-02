import Link from 'next/link'
import { Instrument_Sans, IBM_Plex_Mono } from 'next/font/google'
import s from './track.module.css'

export const dynamic = 'force-dynamic'

const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-track-sans', display: 'swap' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-track-mono', display: 'swap' })

/** Marca Moovex: la "M" dibujada como una línea de ruta con dos paradas. */
function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="8" fill="#a3e635" />
      <path d="M7 21.5 12 11l4 6.4 4-6.4 5 10.5" fill="none" stroke="#0e1622"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="21.5" r="2" fill="#0e1622" />
      <circle cx="25" cy="21.5" r="2" fill="#0e1622" />
    </svg>
  )
}

// Layout propio del tracking público: sin sidebar, sin topbar, mobile-first.
export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${s.shell} ${sans.variable} ${mono.variable}`}>
      <div className={s.wrap}>
        <header className={s.header}>
          <Link href="/track" className={s.brand} aria-label="Moovex — buscar un pedido">
            <LogoMark />
            <span className={s.wordmark}>Moovex</span>
          </Link>
          <span className={s.headerTag}>Seguimiento</span>
        </header>

        <main>{children}</main>

        <footer className={s.footer}>
          <span>¿Dudas con tu pedido? Contacta a la tienda donde compraste.</span>
          <span className={s.mono}>moovex · última milla</span>
        </footer>
      </div>
    </div>
  )
}
