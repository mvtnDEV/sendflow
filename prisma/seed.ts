import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('\n🔧 Moovex — Setup inicial\n')

  const count = await prisma.user.count()
  if (count > 0) {
    console.log('⚠️  Ya existen usuarios en la base de datos. Seed omitido.')
    console.log('   Para resetear: npx prisma db push --force-reset && npm run db:seed\n')
    return
  }

  const email    = process.env.FIRST_ADMIN_EMAIL
  const password = process.env.FIRST_ADMIN_PASSWORD
  const name     = process.env.FIRST_ADMIN_NAME || 'Administrador'

  if (!email || !password) {
    throw new Error(
      'ERROR: Define FIRST_ADMIN_EMAIL y FIRST_ADMIN_PASSWORD en .env antes de correr el seed'
    )
  }

  const hash  = await bcrypt.hash(password, 12)
  const admin = await prisma.user.create({
    data: {
      email,
      name,
      password: hash,
      role:     'SUPER_ADMIN',
      isActive: true,
    },
  })

  console.log('✅ Primer Super Admin creado:')
  console.log(`   Email:  ${admin.email}`)
  console.log(`   Nombre: ${admin.name}`)
  console.log('\n⚠️  IMPORTANTE: Cambia la contraseña al primer login.')
  console.log('   Desde el sistema: Usuarios → tu perfil → Cambiar contraseña\n')
}

main().catch(console.error).finally(() => prisma.$disconnect())
