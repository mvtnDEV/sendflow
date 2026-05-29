export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/utils/crypto'
import { audit } from '@/lib/services/audit.service'
import { headers } from 'next/headers'
import jwt from 'jsonwebtoken'

export async function POST(req: NextRequest) {
  const { pin, driverId } = await req.json().catch(() => ({}))
  if (!pin || !driverId) {
    return NextResponse.json({ ok: false, error: 'PIN y driverId requeridos' }, { status: 400 })
  }

  const ip = headers().get('x-forwarded-for')?.split(',')[0] ?? 'unknown'

  // ── Rate limiting: máx 5 intentos por driverId+IP en 15 min ──
  const since   = new Date(Date.now() - 15 * 60 * 1000)
  const attempts = await prisma.loginAttempt.count({
    where: { email: `driver:${driverId}`, ip, success: false, createdAt: { gte: since } },
  })
  if (attempts >= 5) {
    return NextResponse.json({
      ok: false,
      error: 'Demasiados intentos fallidos. Espera 15 minutos.',
    }, { status: 429 })
  }

  const driver = await prisma.user.findFirst({
    where:  { id: driverId, role: 'DRIVER', isActive: true },
    select: { id: true, name: true, pin: true, storeId: true },
  })

  if (!driver?.pin) {
    return NextResponse.json({ ok: false, error: 'Conductor no encontrado' }, { status: 404 })
  }

  const valid = await verifyPassword(pin, driver.pin)

  // ── Registrar intento ──
  await prisma.loginAttempt.create({
    data: { email: `driver:${driverId}`, ip, success: valid },
  })

  if (!valid) {
    await audit({ userId: driverId, action: 'LOGIN_FAILED', resource: `driver:${driverId}` })
    return NextResponse.json({ ok: false, error: 'PIN incorrecto' }, { status: 401 })
  }

  // ── Token JWT firmado ──
const token = jwt.sign(
    { id: driver.id, name: driver.name, role: 'DRIVER', storeId: driver.storeId },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: '8h' }
  )

  await prisma.user.update({
    where: { id: driver.id },
    data:  { lastLoginAt: new Date(), lastLoginIp: ip },
  })

  await audit({ userId: driver.id, action: 'LOGIN', resource: `driver:${driver.id}` })

  return NextResponse.json({
    ok:   true,
    data: { token, driver: { id: driver.id, name: driver.name } },
  })
}
