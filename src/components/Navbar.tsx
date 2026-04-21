import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { getTodaysDailySet, getMyDailyRank, getQuestionCount } from '../lib/api'

export function Navbar() {
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [rank, setRank] = useState<number | null>(null)
  const [questionCount, setQuestionCount] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    getQuestionCount().then(setQuestionCount).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    async function loadRank() {
      try {
        const set = await getTodaysDailySet()
        if (!set) return
        const r = await getMyDailyRank(set.id)
        setRank(r)
      } catch { /* ignore */ }
    }
    loadRank()
  }, [user, location.pathname]) // refresh rank after navigating (e.g. after playing)

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo + question count */}
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xl font-bold text-indigo-700 tracking-tight">
            Cnndrm
          </Link>
          {questionCount !== null && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {questionCount.toLocaleString()} questions in the vault
            </span>
          )}
        </div>

        {/* Center links */}
        <div className="hidden sm:flex items-center gap-1">
          <Link
            to="/play"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              isActive('/play') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Daily
          </Link>
          <Link
            to="/endless"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              isActive('/endless') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Endless
          </Link>
          <Link
            to="/leaderboard"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              isActive('/leaderboard') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Leaderboard
          </Link>
          <Link
            to="/friends"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              isActive('/friends') || isActive('/challenge') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Friends
          </Link>
          <Link
            to="/submit"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              isActive('/submit') ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Submit
          </Link>
        </div>

        {/* Right: user info */}
        {user ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {/* Rank badge */}
              {rank !== null && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                  rank === 2 ? 'bg-gray-100 text-gray-600' :
                  rank === 3 ? 'bg-orange-100 text-orange-600' :
                  'bg-indigo-50 text-indigo-600'
                }`}>
                  #{rank}
                </span>
              )}
              <span className="text-sm font-semibold text-gray-900">
                {profile?.username ?? user.email?.split('@')[0]}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Profile
                  </Link>
                  <Link
                    to="/awards"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    🏅 Awards
                  </Link>
                  <Link
                    to="/history"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    History
                  </Link>
                  {profile?.role === 'admin' && (
                    <>
                      <div className="border-t border-gray-100" />
                      <Link
                        to="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2.5 text-sm text-indigo-700 font-medium hover:bg-indigo-50"
                      >
                        ⚙️ Admin
                      </Link>
                    </>
                  )}
                  <div className="border-t border-gray-100" />
                  <button
                    onClick={() => { setMenuOpen(false); handleSignOut() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
              Log in
            </Link>
            <Link to="/signup" className="bg-indigo-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-indigo-700">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
