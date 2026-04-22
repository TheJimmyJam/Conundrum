import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { checkUsernameAvailable } from '../lib/api'

export default function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function validateUsernameFormat(value: string): string {
    if (value.length < 6) return 'Username must be at least 6 characters.'
    if (value.length > 18) return 'Username must be 18 characters or fewer.'
    if (!/^[a-zA-Z0-9]+$/.test(value)) return 'Letters and numbers only — no spaces or special characters.'
    return ''
  }

  async function handleUsernameBlur() {
    if (!username) return
    const formatErr = validateUsernameFormat(username)
    if (formatErr) { setUsernameError(formatErr); return }
    const available = await checkUsernameAvailable(username.toLowerCase())
    setUsernameError(available ? '' : 'Username is already taken.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const formatErr = validateUsernameFormat(username)
    if (formatErr) { setUsernameError(formatErr); return }
    if (usernameError) return
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.toLowerCase() },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    navigate('/verify-email')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-sm border border-white/10">
        <Link to="/" className="text-2xl font-bold text-amber-400 block mb-8">Cnndrm</Link>
        <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
        <p className="text-gray-400 text-sm mb-8">Free forever. No credit card needed.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={handleUsernameBlur}
              placeholder="coolplayer42"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {usernameError
              ? <p className="text-red-400 text-xs mt-1">{usernameError}</p>
              : <p className="text-gray-500 text-xs mt-1">6–18 characters, letters and numbers only.</p>
            }
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !!usernameError}
            className="w-full bg-amber-500 text-white font-semibold py-2.5 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-6 leading-relaxed">
          By creating an account you agree to our{' '}
          <Link to="/terms" className="text-amber-400 hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link to="/privacy" className="text-amber-400 hover:underline">Privacy Policy</Link>.
        </p>
        <p className="text-center text-sm text-gray-400 mt-3">
          Already have an account? <Link to="/login" className="text-amber-400 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  )
}
