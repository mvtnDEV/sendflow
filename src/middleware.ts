import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/utils/auth'

// Rate limit en memoria (por instancia serverless)
const rateMap = new Map<string, { count: number; reset: number }>()

function checkRateLimit(ip: string, limit = 100, windowMs = 60_000): boolean {
  const now   = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.reset) { rateMap.set(ip, { count: 1, reset: now + windowMs }); return true }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

function addHeaders(res: NextResponse) {
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  return res
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn   = !!req.auth
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  // Rate limiting en auth
  if (['/api/auth', '/login', '/api/driver/auth'].some(r => pathname.startsWith(r))) {
    if (!checkRateLimit(ip, 20, 60_000)) return new NextResponse('Too many requests', { status: 429 })
  }

  // Rate limiting general API
  if (pathname.startsWith('/api/') && !checkRateLimit(ip, 300, 60_000)) {
    return new NextResponse('Too many requests', { status: 429 })
  }

  // Rutas públicas — no requieren login
  const publicPaths = [
    '/login',
    '/api/auth',
    '/api/tracking',
    '/api/webhooks',
    '/api/privacy',
    '/api/driver/auth',
    '/api/driver/orders',
    '/api/driver/scan',
    '/api/driver/evidence',
  ]
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return addHeaders(NextResponse.next())
  }

  // Rutas protegidas — requieren login
  if (!isLoggedIn) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }
    const url = new URL('/login', req.nextUrl.origin)
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  return addHeaders(NextResponse.next())
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'],
}
