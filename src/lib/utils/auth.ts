import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/utils/crypto'
import type { SessionUser } from '@/types'

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  pages:   { signIn: '/login' },

  providers: [
    Credentials({
      credentials: {
        email:    { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.isActive) return null

        const valid = await verifyPassword(credentials.password as string, user.password)
        if (!valid) return null

        // Lo que devolvemos aquí queda en el JWT
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
    // Persiste rol y storeId en el JWT
    async jwt({ token, user }) {
      if (user) {
        token.role    = (user as any).role
        token.storeId = (user as any).storeId
      }
      return token
    },
    // Expone rol y storeId en la sesión del cliente
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

// ─── Helper para leer sesión en Server Components / Route Handlers ────────────

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user) return null
  return session.user as unknown as SessionUser
}

// ─── Helper de autorización ───────────────────────────────────────────────────

/**
 * Verifica que el usuario tiene acceso a un storeId dado.
 * SUPER_ADMIN puede acceder a cualquier tienda.
 * STORE_ADMIN solo puede acceder a su propia tienda.
 */
export function canAccessStore(user: SessionUser, storeId: string): boolean {
  if (user.role === 'SUPER_ADMIN') return true
  return user.storeId === storeId
}
// ─── Helper para verificar si el usuario es solo visualizador ─────────────────
export function isViewer(user: SessionUser): boolean {
  return user.role === 'VIEWER'
}

// ─── Helper para verificar si puede escribir (no es VIEWER ni DRIVER) ─────────
export function canWrite(user: SessionUser): boolean {
  return !['VIEWER', 'DRIVER'].includes(user.role)
}
