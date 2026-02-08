import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Si hay sesión, ir a dashboard; si no, ir a login
  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
