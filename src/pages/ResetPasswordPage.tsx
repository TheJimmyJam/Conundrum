import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // sessionReady = AuthProvider has exchanged the recovery token and set user
  const sessionReady = !!user

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords don't match."); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }

    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        if (error.message.toLowerCase().includes('same') ||
            error.message.toLowerCase().includes('different')) {
          setError('New password must be different from your current one.')
        } else {
          setError(error.message)
        }
        return
      }
      setDone(true)
      setTimeout(() => navigate('/play'), 2500)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
        <div className="bg-white/5 w-full max-w-md p-8 rounded-2xl border border-white/10 text-center">
          <Link to="/" className="text-2xl font-bold text-amber-400 block mb-8">Cnndrm</Link>
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-xl font-bold text-white mb-2">Waiting for reset link…</h1>
          <p className="text-gray-400 text-sm">
            Make sure you opened this page from the link in your email.
          </p>
          <p className="text-center text-sm text-gray-400 mt-6">
            <Link to="/forgot-password" className="text-amber-400 hover:underline">Request a new link</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
      <div className="bg-white/5 w-full max-w-md p-8 rounded-2xl border border-white/10">
        <Link to="/" className="text-2xl font-bold text-amber-400 block mb-8">Cnndrm</Link>

        {done ? (
          <div className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-white mb-2">Password updated!</h1>
            <p className="text-gray-400 text-sm">Taking you to your dashboard…</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Set a new password</h1>
            <p className="text-gray-400 text-sm mb-8">Choose something you'll remember.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={8}
                  className="w-full border border-white/10 bg-white/5 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-500"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full border border-white/10 bg-white/5 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 text-white font-semibold py-2.5 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
