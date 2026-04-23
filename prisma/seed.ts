import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('\n🔧 SendFlow — Setup inicial\n')

  // Verificar si ya hay usuarios
  const count = await prisma.user.count()
  if (count > 0) {
    console.log('⚠️  Ya existen usuarios en la base de datos. Seed omitido.')
    console.log('   Para resetear: npx prisma db push --force-reset && npm run db:seed\n')
    return
  }

  // ─── Crear SOLO el primer Super Admin ────────────────────────────────────
  // Este es el único usuario creado automáticamente.
  // Todos los demás usuarios (admins, tiendas, conductores) se crean desde el sistema.

  const email    = process.env.FIRST_ADMIN_EMAIL    || 'admin@sendflow.cl'
  const password = process.env.FIRST_ADMIN_PASSWORD || 'Sendflow2025!'
  const name     = process.env.FIRST_ADMIN_NAME     || 'Administrador'

  const hash = await bcrypt.hash(password, 12)

  const admin = await prisma.user.create({
    data: {
      email,
      name,
      password: hash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  })

  console.log('✅ Primer Super Admin creado:')
  console.log(`   Email:      ${admin.email}`)
  console.log(`   Contraseña: ${password}`)
  console.log(`   Nombre:     ${admin.name}`)
  console.log('\n⚠️  IMPORTANTE: Cambia la contraseña al primer login.')
  console.log('   Desde el sistema: Usuarios → tu perfil → Cambiar contraseña\n')
  console.log('📌 Todos los demás usuarios se crean desde:')
  console.log('   Sistema web → Usuarios → Nuevo usuario\n')
}

main().catch(console.error).finally(() => prisma.$disconnect())
