import { NextRequest, NextResponse } from 'next/server'
import { syncAllIntegrations } from '@/lib/services/sync.service'

// GET /api/sync
// Invocado por Vercel Cron cada 15 minutos.
// Protegido por CRON_SECRET para que nadie externo pueda dispararlo.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const results = await syncAllIntegrations()
    const summary = {
      total:   results.length,
      success: results.filter(r => r.ok).length,
      failed:  results.filter(r => !r.ok).length,
      results,
    }
    console.log('[Sync cron]', summary)
    return NextResponse.json({ ok: true, data: summary })
  } catch (err) {
    console.error('[Sync cron]', err)
    return NextResponse.json({ error: 'Error en sync' }, { status: 500 })
  }
}
