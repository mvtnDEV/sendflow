import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser }             from '@/lib/utils/auth'
import { prisma }                     from '@/lib/db/prisma'
import { hashPassword }               from '@/lib/utils/crypto'

// PATCH /api/users/[id] — editar usuario
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getSessionUser()
  if (!me || me.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok:false, error:'Sin permisos' }, { status:403 })
  }

  const body = await req.json().catch(() => ({}))
  const data: any = {}

  // Campos de perfil
  if (body.name     !== undefined) data.name     = body.name
  if (body.email    !== undefined) data.email    = body.email
  if (body.phone    !== undefined) data.phone    = body.phone || null
  if (body.storeId  !== undefined) data.storeId  = body.storeId || null
  if (body.isActive !== undefined) data.isActive = body.isActive

  // Cambio de contraseña
  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ ok:false, error:'Mínimo 8 caracteres' }, { status:400 })
    }
    data.password = await hashPassword(body.password)
  }

  // Cambio de PIN (conductores)
  if (body.pin) {
    if (body.pin.length !== 4 || !/^\d+$/.test(body.pin)) {
      return NextResponse.json({ ok:false, error:'El PIN debe ser 4 dígitos' }, { status:400 })
    }
    data.pin      = await hashPassword(body.pin)
    data.password = await hashPassword(body.pin) // sincronizar
  }

  // Verificar email único si cambió
  if (body.email) {
    const conflict = await prisma.user.findFirst({
      where: { email: body.email, NOT: { id: params.id } },
    })
    if (conflict) {
      return NextResponse.json({ ok:false, error:'Ese email ya está en uso' }, { status:409 })
    }
  }

  await prisma.user.update({ where:{ id:params.id }, data })

  return NextResponse.json({ ok:true })
}

// DELETE /api/users/[id] — eliminar usuario (soft delete = desactivar)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getSessionUser()
  if (!me || me.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok:false, error:'Sin permisos' }, { status:403 })
  }
  if (params.id === me.id) {
    return NextResponse.json({ ok:false, error:'No puedes eliminarte a ti mismo' }, { status:400 })
  }

  await prisma.user.update({ where:{ id:params.id }, data:{ isActive:false } })
  return NextResponse.json({ ok:true })
}
