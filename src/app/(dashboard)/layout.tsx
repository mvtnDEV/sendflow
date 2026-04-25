export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/utils/auth'
import Sidebar from '@/components/layout/Sidebar'
import Topbar  from '@/components/layout/Topbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar user={user} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Topbar user={user} />
        {user.role === 'VIEWER' && (
          <div style={{ background:'#FFFBEB', borderBottom:'1px solid #FDE68A', padding:'8px 24px', fontSize:12, color:'#92400E', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <span>👁</span>
            <span><strong>Modo visualización</strong> — Solo puedes ver el sistema. No puedes crear, editar ni eliminar nada.</span>
          </div>
        )}
        <main style={{ flex:1, overflowY:'auto', padding:24, background:'#F0F4F8' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
