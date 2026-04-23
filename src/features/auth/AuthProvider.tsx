import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setSession, setLoading, loadProfile } = useAuthStore()

  useEffect(() => {
    // Get initial session — wait for profile before clearing loading
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await loadProfile()
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await loadProfile()
      else setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return <>{children}</>
}
