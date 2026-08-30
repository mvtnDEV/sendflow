'use client'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/types'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':            'Tablero',
  '/reportes':             'Reportes y métricas',
  '/alertas':              'Alertas operativas',
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

export default function Topbar({ user, onMenuClick }: {
  user: SessionUser
  onMenuClick?: () => void
}) {
  const pathname = usePathname()
  const title = Object.entries(PAGE_TITLES).find(([k]) =>
    pathname === k || pathname.startsWith(k + '/')
  )?.[1] ?? 'Moovex'

  const today = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'America/Santiago',
  })

  return (
    <header style={{
      background: 'white', borderBottom: '1px solid #E2E8F0',
      height: 54, padding: '0 16px',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Botón hamburguesa — solo móvil */}
        <button onClick={onMenuClick} className="menu-btn"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect x="2" y="4" width="16" height="2" rx="1"/>
            <rect x="2" y="9" width="16" height="2" rx="1"/>
            <rect x="2" y="14" width="16" height="2" rx="1"/>
          </svg>
        </button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.2 }}>{title}</div>
          <div className="topbar-date" style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'capitalize' }}>{today}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="topbar-name" style={{ fontSize: 13, color: '#374151' }}>{user.name}</span>
        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20, background: '#EFF6FF', color: '#1D4ED8', whiteSpace: 'nowrap' }}>
          {ROLE_LABEL[user.role] ?? user.role}
        </span>
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
