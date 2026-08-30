export const dynamic = 'force-dynamic'

// Layout propio del tracking público: sin sidebar, sin topbar, mobile-first.
export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0B1628',
        color: '#E2E8F0',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        padding: '0 16px 48px',
      }}
    >
      <header style={{ maxWidth: 520, margin: '0 auto', padding: '28px 0 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em', color: 'white' }}>Moovex</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Seguimiento de tu pedido</div>
      </header>
      <main style={{ maxWidth: 520, margin: '0 auto' }}>{children}</main>
      <footer style={{ maxWidth: 520, margin: '32px auto 0', textAlign: 'center', fontSize: 11, color: '#475569' }}>
        ¿Dudas con tu pedido? Contacta a la tienda donde compraste.
      </footer>
    </div>
  )
}
