import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setSession, setLoading, loadProfile } = useAuthStore()

  useEffect(() => {
    // onAuthStateChange fires immediately with INITIAL_SESSION on mount —
    // calling getSession() in parallel creates a second lock request that races
    // against the listener, causing "lock was stolen" errors on recovery flows.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (event === 'PASSWORD_RECOVERY') {
        // Recovery flow: session is set so ResetPasswordPage can call updateUser.
        // Don't loadProfile here — that DB round-trip holds the lock and blocks updateUser.
        setLoading(false)
      } else if (session?.user) {
        await loadProfile()
        setLoading(false)
      } else {
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return <>{children}</>
}
