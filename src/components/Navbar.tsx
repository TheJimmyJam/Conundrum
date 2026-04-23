import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import logo from '../assets/cnndrm_logo.svg'
import {
  getTodaysDailySet,
  getMyDailyRank,
  getQuestionCount,
  getUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '../lib/api'

function notificationContent(n: AppNotification) {
  if (n.type === 'submission_approved') {
    return {
      icon: '🎉',
      title: 'Your question made it into the vault!',
      body: n.payload?.message ?? "You knew something we didn't — thanks for sharing it!",
      sub: n.payload?.prompt ? `"${n.payload.prompt}"` : null,
    }
  }
  return { icon: '🔔', title: 'New notification', body: '', sub: null }
}

export function Navbar() {
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [rank, setRank] = useState<number | null>(null)
  const [questionCount, setQuestionCount] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  useEffect(() => {
    getQuestionCount().then(setQuestionCount).catch(() => {})
  }, [location.pathname])

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
  }, [user, location.pathname])

  useEffect(() => {
    if (!user) return
    getUnreadNotifications().then(setNotifications).catch(() => {})
  }, [user, location.pathname])

  async function handleMarkRead(id: string) {
    await markNotificationRead(id).catch(() => {})
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead().catch(() => {})
    setNotifications([])
    setNotifOpen(false)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <nav className="bg-[#0f0f1a] border-b border-amber-500/20 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo + question count */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center">
            <img src={logo} alt="Conundrum" className="h-8 w-auto" />
          </Link>
          {questionCount !== null && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {questionCount.toLocaleString()} questions in the vault
            </span>
          )}
        </div>

        {/* Center links */}
        <div className="hidden sm:flex items-center gap-1">
          <Link to="/play" className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${isActive('/play') ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            Daily
          </Link>
          <Link to="/endless" className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${isActive('/endless') ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            Endless
          </Link>
          <Link to="/leaderboard" className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${isActive('/leaderboard') ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            Leaderboard
          </Link>
          <Link to="/friends" className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${isActive('/friends') || isActive('/challenge') ? 'bg-amber-500/10 text-amber-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            Friends
          </Link>
          {/* Submit dropdown */}
          <div className="relative">
            <button
              onClick={() => { setSubmitOpen(o => !o); setMenuOpen(false); setNotifOpen(false) }}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                isActive('/submit') || isActive('/submit-set')
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Submit
              <svg className={`w-3 h-3 transition-transform ${submitOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {submitOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSubmitOpen(false)} />
                <div className="absolute left-0 mt-1 w-44 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <Link
                    to="/submit"
                    onClick={() => setSubmitOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    💡 Daily Community
                    <span className="block text-xs text-gray-500 mt-0.5">1 question</span>
                  </Link>
                  <div className="border-t border-white/10" />
                  <Link
                    to="/submit-set"
                    onClick={() => setSubmitOpen(false)}
                    className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    📋 Daily Set
                    <span className="block text-xs text-gray-500 mt-0.5">10 questions</span>
                  </Link>
                </div>
              </>
            )}
          </div>
          {profile?.role === 'admin' && (
            <Link to="/admin" className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${isActive('/admin') ? 'bg-red-500/10 text-red-400' : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'}`}>
              Admin
            </Link>
          )}
        </div>

        {/* Right: notifications + user menu */}
        {user ? (
          <div className="flex items-center gap-1">

            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => { setNotifOpen(o => !o); setMenuOpen(false) }}
                className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
                title="Notifications"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0f0f1a]" />
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 mt-1 w-80 bg-[#1a1a2e] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                      <span className="text-sm font-semibold text-white">Notifications</span>
                      {notifications.length > 0 && (
                        <button onClick={handleMarkAllRead} className="text-xs text-amber-400 hover:underline">
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-8">You're all caught up!</p>
                    ) : (
                      <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                        {notifications.map(n => {
                          const { icon, title, body, sub } = notificationContent(n)
                          return (
                            <div key={n.id} className="px-4 py-3 hover:bg-white/5">
                              <div className="flex items-start gap-3">
                                <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white">{title}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{body}</p>
                                  {sub && <p className="text-xs text-gray-500 mt-1 italic truncate">{sub}</p>}
                                </div>
                                <button
                                  onClick={() => handleMarkRead(n.id)}
                                  className="text-gray-600 hover:text-gray-300 text-xl leading-none flex-shrink-0"
                                  title="Dismiss"
                                >×</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => { setMenuOpen(o => !o); setNotifOpen(false) }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                {rank !== null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    rank === 1 ? 'bg-amber-500/20 text-amber-400' :
                    rank === 2 ? 'bg-white/10 text-gray-300' :
                    rank === 3 ? 'bg-orange-500/20 text-orange-400' :
                    'bg-amber-500/10 text-amber-400'
                  }`}>
                    #{rank}
                  </span>
                )}
                <span className="text-sm font-semibold text-white">
                  {profile?.username ?? user.email?.split('@')[0]}
                </span>
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-44 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <Link to="/profile" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white">Profile</Link>
                    <Link to="/leaderboard" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white">Leaderboard</Link>
                    <Link to="/awards" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white">🏅 Awards</Link>
                    <Link to="/history" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white">History</Link>
                    {profile?.role === 'admin' && (
                      <>
                        <div className="border-t border-white/10" />
                        <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm text-amber-400 font-medium hover:bg-amber-500/10">⚙️ Admin</Link>
                      </>
                    )}
                    <div className="border-t border-white/10" />
                    <button onClick={() => { setMenuOpen(false); handleSignOut() }} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10">
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        ) : (
          <div className="flex gap-2">
            <Link to="/login" className="text-sm text-gray-400 hover:text-white px-3 py-1.5">Log in</Link>
            <Link to="/signup" className="bg-amber-500 text-black text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-amber-400">Sign up</Link>
          </div>
        )}
      </div>
    </nav>
  )
}
