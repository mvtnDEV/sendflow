'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import type { SessionUser } from '@/types'

const NAV = [
  {
    label: 'Principal',
    items: [
      { href: '/dashboard',      label: 'Tablero',       icon: 'grid',   roles: ['SUPER_ADMIN','STORE_ADMIN','VIEWER'] },
      { href: '/reportes',       label: 'Reportes',      icon: 'chart',  roles: ['SUPER_ADMIN','STORE_ADMIN','VIEWER'] },
    ],
  },
  {
    label: 'Envíos',
    items: [
      { href: '/recepciones',          label: 'Recepciones',  icon: 'inbox',  roles: ['SUPER_ADMIN','STORE_ADMIN','VIEWER'] },
      { href: '/pedidos/nuevo',        label: 'Nuevo pedido', icon: 'plus',   roles: ['SUPER_ADMIN','STORE_ADMIN'] },
      { href: '/pedidos/carga-masiva', label: 'Carga Excel',  icon: 'upload', roles: ['SUPER_ADMIN','STORE_ADMIN'] },
      { href: '/busqueda',             label: 'Búsqueda',     icon: 'search', roles: ['SUPER_ADMIN','STORE_ADMIN','VIEWER'] },
      { href: '/tracking',             label: 'Tracking',     icon: 'map',    roles: ['SUPER_ADMIN','STORE_ADMIN','VIEWER'] },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { href: '/usuarios',      label: 'Usuarios',      icon: 'users', roles: ['SUPER_ADMIN'] },
      { href: '/tiendas',       label: 'Tiendas',       icon: 'store', roles: ['SUPER_ADMIN'] },
      { href: '/conductores',   label: 'Conductores',   icon: 'truck', roles: ['SUPER_ADMIN'] },
      { href: '/integraciones', label: 'Integraciones', icon: 'plug',  roles: ['SUPER_ADMIN','STORE_ADMIN'] },
    ],
  },
]

const ICONS: Record<string, React.ReactNode> = {
  grid:   <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>,
  inbox:  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v2H1zm2 3h10l2 5H1l2-5zm2 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm6 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0z"/></svg>,
  plus:   <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm1 4v2h2v2H9v2H7V9H5V7h2V5h2z"/></svg>,
  upload: <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M2 13h12v1H2zm6-11L4 6h3v5h2V6h3L8 2z"/></svg>,
  search: <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>,
  map:    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a5 5 0 0 0-5 5c0 4 5 9 5 9s5-5 5-9a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>,
  store:  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2h14v3l-1 1H2L1 5V2zm1 4h12v8H2V6zm3 2v4h6V8H5z"/></svg>,
  chart:  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M15 12H1v1h14v-1zM4 7L1 11h3V7zm3 2L4 7v4h3V9zm3-5L7 9v2h3V4zm3 3l-3-3v7h3V7z"/></svg>,
  users:  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="5.5" cy="4" r="2.5"/><path d="M1 13c0-2.5 2-4.5 4.5-4.5S10 10.5 10 13H1z"/><circle cx="11.5" cy="5" r="2"/><path d="M10 13.5c0-1.8.9-3.4 2.2-4.3A3.9 3.9 0 0 1 15 13.5h-5z"/></svg>,
  truck:  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M0 3h10v7H0V3zm10 2h2l3 3v2h-5V5zm-8 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>,
  plug:   <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M6 1v3H4V1H3v3H1v2h2v1a4 4 0 0 0 3 3.87V14h2v-3.13A4 4 0 0 0 11 7V6h2V4h-1V1h-1v3H7V1H6z"/></svg>,
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  STORE_ADMIN: 'Admin Tienda',
  VIEWER:      'Visualizador',
  DRIVER:      'Conductor',
}

export default function Sidebar({ user, open, onClose }: {
  user: SessionUser
  open?: boolean
  onClose?: () => void
}) {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  useEffect(() => { onClose?.() }, [pathname])

  const sidebarContent = (
    <aside style={{
      width: 228, minWidth: 228,
      background: 'var(--bg-sidebar)',
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      borderRight: '1px solid var(--border)',
    }}>

      {/* ── Logo ── */}
      <div style={{
        padding: '20px 18px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
        }}>
          <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
            <path d="M4 22V8l10 8 10-8v14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Moovex</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Gestión logística</div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>

      {/* ── Nav ── */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
        {NAV.map(section => (
          <div key={section.label} style={{ marginBottom: 4 }}>
            <div style={{
              padding: '8px 18px 4px',
              fontSize: 10, fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '.1em',
            }}>
              {section.label}
            </div>

            {section.items
              .filter(item => item.roles.includes(user.role))
              .map(item => {
                const active = isActive(item.href)
                return (
                  <Link key={item.href} href={item.href} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', margin: '1px 8px', borderRadius: 8,
                    fontSize: 13, textDecoration: 'none', transition: 'all 0.15s',
                    background: active ? 'var(--accent-light)' : 'transparent',
                    color:      active ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: active ? 500 : 400,
                    position: 'relative',
                  }}>
                    {/* Indicador activo */}
                    {active && (
                      <div style={{
                        position: 'absolute', left: 0, top: '20%', bottom: '20%',
                        width: 3, borderRadius: '0 3px 3px 0',
                        background: 'var(--accent)',
                      }}/>
                    )}
                    <span style={{ color: active ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>
                      {ICONS[item.icon]}
                    </span>
                    <span style={{ flex: 1 }}>{item.label}</span>

                    {item.href === '/pedidos/carga-masiva' && (
                      <span style={{ fontSize: 9, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', padding: '2px 6px', borderRadius: 8, fontWeight: 600 }}>XLS</span>
                    )}
                    {item.href === '/integraciones' && (
                      <span style={{ fontSize: 9, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 8, fontWeight: 600 }}>API</span>
                    )}
                  </Link>
                )
              })}
          </div>
        ))}
      </nav>

      {/* ── Footer usuario ── */}
      <div style={{
        padding: '12px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600, color: 'white', flexShrink: 0,
          boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
        }}>
          {user.name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            {ROLE_LABEL[user.role] ?? user.role}
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="Cerrar sesión"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 6, flexShrink: 0,
            borderRadius: 6, display: 'flex', alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M10 2h4v12h-4v-1h3V3h-3V2zM7 4l5 4-5 4V9H1V7h6V4z"/></svg>
        </button>
      </div>
    </aside>
  )

  return (
    <>
      <div className="sidebar-desktop">{sidebarContent}</div>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}
          onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }}/>
          <div style={{ position: 'relative', width: 260, height: '100%', zIndex: 51 }}>
            {sidebarContent}
          </div>
        </div>
      )}

      <style>{`
        .sidebar-desktop { display: flex; }
        @media (max-width: 768px) { .sidebar-desktop { display: none; } }
        nav a:hover {
          background: var(--bg-card-hover) !important;
          color: var(--text-primary) !important;
        }
        nav a:hover span:first-of-type {
          color: var(--text-secondary) !important;
        }
      `}</style>
    </>
  )
}
