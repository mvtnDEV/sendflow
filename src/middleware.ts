export { auth as default } from '@/lib/utils/auth'

export const config = {
 matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|login|api/webhooks|api/tracking|api/driver|public-tracking|track|api/v1).*)'],
}
