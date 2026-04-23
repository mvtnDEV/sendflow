'use client'

import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/types'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':              'Tablero',
  '/reportes':               'Reportes y métricas',
  '/recepciones':            'Recepciones',
  '/pedidos/nuevo':          'Nuevo pedido',
  '/pedidos/carga-masiva':   'Carga masiva Excel',
  '/busqueda':               'Búsqueda avanzada',
  '/tracking':               'Tracking de pedidos',
  '/tiendas':                'Mis tiendas',
  '/conductores':            'Conductores',
  '/integraciones':          'Integraciones',
  '/usuarios':               'Usuarios',
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  STORE_ADMIN: 'Admin Tienda',
  DRIVER:      'Conductor',
}

export default function Topbar({ user }: { user: SessionUser }) {
  const pathname = usePathname()

  const title = Object.entries(PAGE_TITLES).find(([k]) =>
    pathname === k || pathname.startsWith(k + '/')
  )?.[1] ?? 'SendFlow'

  const today = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <header style={{
      background: 'white',
      borderBottom: '1px solid #E2E8F0',
      height: 54, padding: '0 24px',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{title}</span>
        <span style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'capitalize' }}>{today}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: '#374151' }}>{user.name}</span>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '3px 10px',
          borderRadius: 20, background: '#EFF6FF', color: '#1D4ED8',
        }}>
          {ROLE_LABEL[user.role] ?? user.role}
        </span>
      </div>
    </header>
  )
}
