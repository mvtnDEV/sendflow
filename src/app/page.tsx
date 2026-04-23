import { redirect } from 'next/navigation'
import { auth } from '@/lib/utils/auth'

export default async function RootPage() {
  const session = await auth()
  if (session?.user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
