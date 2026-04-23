import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const publicPaths = [
    '/login',
    '/api/auth',
    '/api/tracking',
    '/api/webhooks',
    '/api/privacy',
    '/api/driver',
  ]

  const isPublic = publicPaths.some(p => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'],
}
