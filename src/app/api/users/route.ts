export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser }             from '@/lib/utils/auth'
import { prisma }                     from '@/lib/db/prisma'
import { hashPassword }               from '@/lib/utils/crypto'
import { audit }                      from '@/lib/services/audit.service'

export async function POST(req: NextRequest) {
  const me = await getSessionUser()
  if (!me || me.role !== 'SUPER_ADMIN')
    return NextResponse.json({ ok:false, error:'Solo Super Admin puede crear usuarios' }, { status:403 })

  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.email || !body?.role)
    return NextResponse.json({ ok:false, error:'name, email y role son requeridos' }, { status:400 })

  const validRoles = ['SUPER_ADMIN', 'STORE_ADMIN', 'VIEWER', 'DRIVER']
  if (!validRoles.includes(body.role))
    return NextResponse.json({ ok:false, error:'Rol inválido' }, { status:400 })

  if (body.role === 'DRIVER') {
    if (!body.pin || body.pin.length !== 4 || !/^\d+$/.test(body.pin))
      return NextResponse.json({ ok:false, error:'El conductor necesita un PIN de 4 dígitos' }, { status:400 })
  } else {
    if (!body.password || body.password.length < 8)
      return NextResponse.json({ ok:false, error:'La contraseña debe tener al menos 8 caracteres' }, { status:400 })
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } })
  if (existing)
    return NextResponse.json({ ok:false, error:'Ya existe un usuario con ese email' }, { status:409 })

  const passwordHash = body.role === 'DRIVER'
    ? await hashPassword(body.pin)
    : await hashPassword(body.password)
  const pinHash = body.role === 'DRIVER' ? await hashPassword(body.pin) : null

  const newUser = await prisma.user.create({
    data: {
      name:     body.name,
      email:    body.email,
      password: passwordHash,
      pin:      pinHash,
      role:     body.role,
      phone:    body.phone || null,
      storeId:  body.storeId || null,
      isActive: true,
    },
    select: {
      id:true, name:true, email:true, role:true,
      phone:true, isActive:true, createdAt:true,
      lastLoginAt:true, storeId:true,
      store: { select: { id:true, name:true } },
    },
  })

  await audit({
    userId:   me.id,
    action:   'CREATE_USER',
    resource: `user:${newUser.id}`,
    metadata: { role: body.role, name: body.name } as any,
  })

  return NextResponse.json({ ok:true, data:newUser }, { status:201 })
}
