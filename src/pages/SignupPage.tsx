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

  async function handleUsernameBlur() {
    if (!username) return
    const available = await checkUsernameAvailable(username.toLowerCase())
    setUsernameError(available ? '' : 'Username is taken.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-sm border border-gray-100">
        <Link to="/" className="text-2xl font-bold text-indigo-700 block mb-8">Cnndrm</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Create your account</h1>
        <p className="text-gray-500 text-sm mb-8">Free forever. No credit card needed.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={handleUsernameBlur}
              placeholder="coolplayer42"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {usernameError && <p className="text-red-500 text-xs mt-1">{usernameError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !!usernameError}
            className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account? <Link to="/login" className="text-indigo-600 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  )
}
