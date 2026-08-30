export const dynamic = 'force-dynamic'
import { NextResponse }        from 'next/server'
import { getSessionUser }      from '@/lib/utils/auth'
import { countActiveAlerts }   from '@/lib/services/alert.service'

// Endpoint mínimo para el badge del sidebar. Se llama cada 60 s.
export async function GET() {
  const me = await getSessionUser()
  if (!me || me.role !== 'SUPER_ADMIN')
    return NextResponse.json({ ok: false, count: 0 }, { status: 403 })

  return NextResponse.json({ ok: true, count: await countActiveAlerts() })
}
