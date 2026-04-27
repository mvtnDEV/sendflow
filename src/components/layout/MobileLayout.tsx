'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar  from './Topbar'
import type { SessionUser } from '@/types'

export default function MobileLayout({
  user, children
}: {
  user: SessionUser
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Topbar user={user} onMenuClick={() => setSidebarOpen(true)} />
        {user.role === 'VIEWER' && (
          <div style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A', padding: '8px 24px', fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span>👁</span>
            <span><strong>Modo visualización</strong> — Solo puedes ver el sistema. No puedes crear, editar ni eliminar nada.</span>
          </div>
        )}
        <main style={{ flex: 1, overflowY: 'auto', padding: 'clamp(12px, 3vw, 24px)', background: '#F0F4F8' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
