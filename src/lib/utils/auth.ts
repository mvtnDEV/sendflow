import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/utils/crypto'
import type { SessionUser } from '@/types'

const MAX_ATTEMPTS = 5
const WINDOW_MINUTES = 15

// Antes esto era SQL crudo con los nombres de columna escritos a mano
// ("created_at"), lo que escondía que el schema y la tabla real no coincidían.
// Con Prisma el mapeo vive en un solo lugar: schema.prisma.
async function checkRateLimit(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000)
  const intentos = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gt: since } },
  })
  return intentos < MAX_ATTEMPTS
}

async function recordAttempt(email: string, ip: string, success: boolean) {
  await prisma.loginAttempt.create({ data: { email, ip, success } })

  // Limpiar intentos antiguos
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  pages:   { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email:    { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
        ip:       { label: 'IP', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email as string
        const ip    = (credentials.ip as string) || 'unknown'

        // Verificar rate limit
        const allowed = await checkRateLimit(email, ip)
        if (!allowed) {
          console.warn(`[Auth] Rate limit alcanzado para: ${email}`)
          throw new Error('TOO_MANY_ATTEMPTS')
        }

        const user = await prisma.user.findUnique({
          where: { email },
        })

        if (!user || !user.isActive) {
          await recordAttempt(email, ip, false)
          return null
        }

        const valid = await verifyPassword(credentials.password as string, user.password)

        if (!valid) {
          await recordAttempt(email, ip, false)
          return null
        }

        // Login exitoso — registrar y limpiar intentos
        await recordAttempt(email, ip, true)

        return {
          id:      user.id,
          email:   user.email,
          name:    user.name,
          role:    user.role,
          storeId: user.storeId,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role    = (user as any).role
        token.storeId = (user as any).storeId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id      = token.sub
        ;(session.user as any).role    = token.role
        ;(session.user as any).storeId = token.storeId
      }
      return session
    },
  },
})

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user) return null
  return session.user as unknown as SessionUser
}

export function canAccessStore(user: SessionUser, storeId: string): boolean {
  if (user.role === 'SUPER_ADMIN') return true
  return user.storeId === storeId
}

export function isViewer(user: SessionUser): boolean {
  return user.role === 'VIEWER'
}

export function canWrite(user: SessionUser): boolean {
  return !['VIEWER', 'DRIVER'].includes(user.role)
}
