export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/utils/crypto'
import { audit } from '@/lib/services/audit.service'
import { headers } from 'next/headers'

// POST /api/driver/auth
// El conductor se autentica con su PIN desde la app móvil
export async function POST(req: NextRequest) {
  const { pin, driverId } = await req.json().catch(() => ({}))

  if (!pin || !driverId) {
    return NextResponse.json({ ok: false, error: 'PIN y driverId requeridos' }, { status: 400 })
  }

  const driver = await prisma.user.findFirst({
    where: { id: driverId, role: 'DRIVER', isActive: true },
    select: { id: true, name: true, pin: true, storeId: true },
  })

  if (!driver?.pin) {
    return NextResponse.json({ ok: false, error: 'Conductor no encontrado' }, { status: 404 })
  }

  const valid = await verifyPassword(pin, driver.pin)
  if (!valid) {
    await audit({ userId: driverId, action: 'LOGIN_FAILED', resource: `driver:${driverId}` })
    return NextResponse.json({ ok: false, error: 'PIN incorrecto' }, { status: 401 })
  }

  // Generar token JWT simple para la sesión del conductor
  const token = Buffer.from(JSON.stringify({
    id:      driver.id,
    name:    driver.name,
    role:    'DRIVER',
    storeId: driver.storeId,
    exp:     Date.now() + 8 * 60 * 60 * 1000, // 8 horas
  })).toString('base64')

  // Actualizar último login
  const ip = headers().get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  await prisma.user.update({
    where: { id: driver.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  })

  await audit({ userId: driver.id, action: 'LOGIN', resource: `driver:${driver.id}` })

  return NextResponse.json({
    ok: true,
    data: { token, driver: { id: driver.id, name: driver.name } },
  })
}
