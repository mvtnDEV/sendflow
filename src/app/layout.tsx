import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/utils/auth'
import './globals.css'

export const metadata: Metadata = {
  title:       'SendFlow — Gestión logística',
  description: 'Sistema de gestión de envíos y recepciones',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <html lang="es">
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
