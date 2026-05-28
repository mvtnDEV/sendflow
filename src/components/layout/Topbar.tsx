'use client'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/types'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':            'Tablero',
  '/reportes':             'Reportes y métricas',
  '/recepciones':          'Recepciones',
  '/pedidos/nuevo':        'Nuevo pedido',
  '/pedidos/carga-masiva': 'Carga masiva Excel',
  '/busqueda':             'Búsqueda avanzada',
  '/tracking':             'Tracking de pedidos',
  '/tiendas':              'Mis tiendas',
  '/conductores':          'Conductores',
  '/integraciones':        'Integraciones',
  '/usuarios':             'Usuarios',
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  STORE_ADMIN: 'Admin Tienda',
  DRIVER:      'Conductor',
  VIEWER:      'Visualizador',
}

const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
  SUPER_ADMIN: { bg: 'rgba(99,102,241,0.15)', color: '#818CF8' },
  STORE_ADMIN: { bg: 'rgba(16,185,129,0.15)', color: '#34D399' },
  VIEWER:      { bg: 'rgba(156,163,175,0.15)', color: '#9CA3AF' },
  DRIVER:      { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
}

export default function Topbar({ user, onMenuClick }: {
  user: SessionUser
  onMenuClick?: () => void
}) {
  const pathname = usePathname()
  const title = Object.entries(PAGE_TITLES).find(([k]) =>
    pathname === k || pathname.startsWith(k + '/')
  )?.[1] ?? 'Moovex'

  const today = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'America/Santiago',
  })

  const rc = ROLE_COLOR[user.role] ?? ROLE_COLOR.VIEWER

  return (
    <header style={{
      background: 'var(--bg-sidebar)',
      borderBottom: '1px solid var(--border)',
      height: 56, padding: '0 20px',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexShrink: 0,
    }}>
      {/* Izquierda — hamburguesa + título */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onMenuClick} className="menu-btn"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <rect x="2" y="4" width="16" height="2" rx="1"/>
            <rect x="2" y="9" width="16" height="2" rx="1"/>
            <rect x="2" y="14" width="16" height="2" rx="1"/>
          </svg>
        </button>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>{title}</div>
          <div className="topbar-date" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize', marginTop: 1 }}>{today}</div>
        </div>
      </div>

      {/* Derecha — usuario + rol */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Notificaciones (placeholder) */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a5 5 0 0 0-5 5v3l-1 1v1h12v-1l-1-1V6a5 5 0 0 0-5-5zm0 13a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2z"/>
          </svg>
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }}/>

        <div className="topbar-user" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: 'white', flexShrink: 0,
          }}>
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <span className="topbar-name" style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {user.name}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            padding: '3px 10px', borderRadius: 20,
            background: rc.bg, color: rc.color,
            whiteSpace: 'nowrap',
          }}>
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
        </div>
      </div>

      <style>{`
        .menu-btn { display: none; }
        @media (max-width: 768px) {
          .menu-btn { display: flex !important; }
          .topbar-date { display: none; }
          .topbar-name { display: none; }
        }
      `}</style>
    </header>
  )
}
