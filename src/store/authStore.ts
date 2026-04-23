import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'
import { getProfile } from '../lib/api'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  loadProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),

  loadProfile: async () => {
    const { user } = get()
    if (!user) return
    try {
      const profile = await getProfile(user.id)
      set({ profile })
    } catch (err) {
      console.error('Failed to load profile', err)
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null })
  },
}))
