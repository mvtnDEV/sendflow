export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/driver/list
// Devuelve la lista de conductores para el selector de login
export async function GET() {
  try {
    const drivers = await prisma.user.findMany({
      where:   { role: 'DRIVER', isActive: true },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ ok: true, data: drivers })
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Error' }, { status: 500 })
  }
}
