import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) { setError(error.message); return }
      setSent(true)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
      <div className="bg-white/5 w-full max-w-md p-8 rounded-2xl border border-white/10">
        <Link to="/" className="text-2xl font-bold text-amber-400 block mb-8">Cnndrm</Link>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📬</div>
            <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
            <p className="text-gray-400 text-sm mb-6">
              We sent a password reset link to <span className="font-semibold text-gray-200">{email}</span>.
              Click the link in that email to set a new password.
            </p>
            <Link to="/login" className="text-amber-400 text-sm hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Forgot your password?</h1>
            <p className="text-gray-400 text-sm mb-8">
              Enter your email and we'll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full border border-white/10 bg-white/5 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-500"
                  placeholder="you@example.com"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 text-white font-semibold py-2.5 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-400 mt-6">
              Remembered it? <Link to="/login" className="text-amber-400 hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
