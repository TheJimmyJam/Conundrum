import { useEffect, useRef, useState } from 'react'
import {
  adminSearchPlayers,
  adminResetPlayerDaily,
  adminResetPlayerLifetime,
  type AdminPlayer,
} from '../../lib/api'

type ConfirmKey = `${'daily' | 'lifetime'}-${string}`

export default function AdminPlayers() {
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Double-click confirm state: key = `daily-<userId>` or `lifetime-<userId>`
  const [armed, setArmed] = useState<ConfirmKey | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    search('')
  }, [])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => search(query), 350)
    return () => clearTimeout(t)
  }, [query])

  async function search(q: string) {
    setLoading(true)
    try {
      setPlayers(await adminSearchPlayers(q))
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function armAction(key: ConfirmKey) {
    if (armTimer.current) clearTimeout(armTimer.current)
    setArmed(key)
    armTimer.current = setTimeout(() => setArmed(null), 3000)
  }

  async function handleReset(userId: string, action: 'daily' | 'lifetime') {
    const key: ConfirmKey = `${action}-${userId}`
    if (armed !== key) {
      armAction(key)
      return
    }
    // Second click — execute
    if (armTimer.current) clearTimeout(armTimer.current)
    setArmed(null)
    setActing(key)
    try {
      const count = action === 'daily'
        ? await adminResetPlayerDaily(userId)
        : await adminResetPlayerLifetime(userId)
      const label = action === 'daily' ? 'daily session' : 'lifetime scores'
      showToast(`✓ Reset ${label} — ${count} session${count !== 1 ? 's' : ''} removed.`)
      // Refresh stats
      setPlayers(await adminSearchPlayers(query))
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally {
      setActing(null)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Players</h1>
        <p className="text-gray-500 mb-8">Search by name, username, or email. Select a player to manage their scores.</p>

        {/* Search */}
        <div className="relative mb-6">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, username, or email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          />
          {loading && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
            </div>
          )}
        </div>

        {/* Player list */}
        {players.length === 0 && !loading ? (
          <div className="bg-white border border-gray-100 rounded-2xl px-6 py-16 text-center">
            <div className="text-3xl mb-2">👤</div>
            <p className="text-gray-400 text-sm">No players found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {players.map(p => {
              const isOpen = expanded === p.id
              const dailyKey: ConfirmKey = `daily-${p.id}`
              const lifetimeKey: ConfirmKey = `lifetime-${p.id}`
              const dailyArmed = armed === dailyKey
              const lifetimeArmed = armed === lifetimeKey
              const dailyActing = acting === dailyKey
              const lifetimeActing = acting === lifetimeKey

              return (
                <div key={p.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                      {(p.display_name ?? p.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">
                        {p.display_name ?? p.username}
                        {p.role === 'admin' && (
                          <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 font-semibold px-1.5 py-0.5 rounded">admin</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">@{p.username} · {p.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <p className="text-sm font-semibold text-gray-700">{p.games_played} games</p>
                      <p className="text-xs text-gray-400">best {p.best_score?.toLocaleString() ?? '—'}</p>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-gray-100 px-5 py-4">
                      <div className="grid grid-cols-3 gap-4 mb-5 text-center">
                        <div className="bg-gray-50 rounded-xl py-3">
                          <p className="text-xl font-bold text-gray-900">{p.games_played}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Games Played</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl py-3">
                          <p className="text-xl font-bold text-gray-900">{p.best_score?.toLocaleString() ?? '—'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Best Score</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl py-3">
                          <p className="text-xs font-medium text-gray-700 mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Joined</p>
                        </div>
                      </div>

                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Score Management</p>
                      <div className="flex flex-wrap gap-3">
                        {/* Reset Daily — double click */}
                        <button
                          onClick={() => handleReset(p.id, 'daily')}
                          disabled={dailyActing || lifetimeActing}
                          className={`text-sm px-4 py-2 rounded-lg border font-medium transition-all disabled:opacity-40 ${
                            dailyArmed
                              ? 'bg-orange-500 text-white border-orange-500 animate-pulse'
                              : 'border-orange-200 text-orange-600 hover:bg-orange-50'
                          }`}
                        >
                          {dailyActing ? 'Resetting…' : dailyArmed ? '⚠ Click again to confirm' : 'Reset Daily Score'}
                        </button>

                        {/* Reset Lifetime — double click */}
                        <button
                          onClick={() => handleReset(p.id, 'lifetime')}
                          disabled={dailyActing || lifetimeActing}
                          className={`text-sm px-4 py-2 rounded-lg border font-medium transition-all disabled:opacity-40 ${
                            lifetimeArmed
                              ? 'bg-red-600 text-white border-red-600 animate-pulse'
                              : 'border-red-200 text-red-500 hover:bg-red-50'
                          }`}
                        >
                          {lifetimeActing ? 'Resetting…' : lifetimeArmed ? '⚠ Click again to confirm' : 'Reset Lifetime Scores'}
                        </button>
                      </div>
                      {(dailyArmed || lifetimeArmed) && (
                        <p className="text-xs text-gray-400 mt-2">Button will disarm in 3 seconds if not confirmed.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 text-center">{players.length} player{players.length !== 1 ? 's' : ''} shown</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}
