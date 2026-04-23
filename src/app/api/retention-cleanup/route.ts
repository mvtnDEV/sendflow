import { NextRequest, NextResponse } from 'next/server'
import { runRetentionCleanup } from '@/lib/services/privacy.service'

// GET /api/retention-cleanup
// Llamado por Vercel Cron a las 3am cada día
// Anonimiza pedidos cuya fecha de retención venció (ley 21.719)
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    const result = await runRetentionCleanup()
    return NextResponse.json({ ok: true, data: result })
  } catch (err) {
    console.error('[retention-cleanup]', err)
    return NextResponse.json({ error: 'Error en cleanup' }, { status: 500 })
  }
}
