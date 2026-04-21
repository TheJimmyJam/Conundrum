import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminSearchPlayers,
  adminResetPlayerDaily,
  adminResetPlayerLifetime,
  adminGenerateDemoUsers,
  adminRemoveDemoUsers,
  adminCountDemoUsers,
  type AdminPlayer,
} from '../../lib/api'

type ConfirmKey = `${'daily' | 'lifetime'}-${string}`

const DEMO_COUNT_OPTIONS = [50, 100, 150, 200]

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

  // Demo data panel
  const [showDemo, setShowDemo] = useState(false)
  const [demoCount, setDemoCount] = useState(150)
  const [demoUserCount, setDemoUserCount] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeArmed, setRemoveArmed] = useState(false)
  const removeArmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  async function openDemoPanel() {
    setShowDemo(true)
    try {
      setDemoUserCount(await adminCountDemoUsers())
    } catch { /* ignore */ }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const result = await adminGenerateDemoUsers(demoCount)
      const newCount = (demoUserCount ?? 0) + result.generated
      setDemoUserCount(newCount)
      showToast(`✓ Generated ${result.generated} demo users for ${result.daily_set_date}.`)
      search(query)
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally {
      setGenerating(false)
    }
  }

  function armRemove() {
    if (removeArmTimer.current) clearTimeout(removeArmTimer.current)
    setRemoveArmed(true)
    removeArmTimer.current = setTimeout(() => setRemoveArmed(false), 4000)
  }

  async function handleRemoveDemo() {
    if (!removeArmed) { armRemove(); return }
    if (removeArmTimer.current) clearTimeout(removeArmTimer.current)
    setRemoveArmed(false)
    setRemoving(true)
    try {
      const count = await adminRemoveDemoUsers()
      setDemoUserCount(0)
      showToast(`✓ Removed ${count} demo user${count !== 1 ? 's' : ''}.`)
      search(query)
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6">
          ← Admin
        </Link>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Players</h1>
          <button
            onClick={openDemoPanel}
            className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 flex items-center gap-2"
          >
            🎭 Demo Data
          </button>
        </div>
        <p className="text-gray-500 mb-6">Search by name, username, or email. Select a player to manage their scores.</p>

        {/* Demo Data Panel */}
        {showDemo && (
          <div className="bg-white border border-purple-100 rounded-2xl p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">🎭 Demo Data</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Fake users for leaderboard demos · all have @demo.conundrum.test emails
                  {demoUserCount !== null && (
                    <span className="ml-2 font-semibold text-purple-600">{demoUserCount} demo users active</span>
                  )}
                </p>
              </div>
              <button onClick={() => setShowDemo(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              {/* Generate */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Count</p>
                <div className="flex gap-1.5">
                  {DEMO_COUNT_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setDemoCount(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        demoCount === n
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'border-gray-200 text-gray-600 hover:border-purple-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || removing}
                className="bg-purple-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-purple-700 disabled:opacity-50"
              >
                {generating ? 'Generating…' : `Generate ${demoCount} users`}
              </button>

              <div className="ml-auto">
                <button
                  onClick={handleRemoveDemo}
                  disabled={removing || generating || demoUserCount === 0}
                  className={`text-sm px-4 py-2.5 rounded-xl border font-medium transition-all disabled:opacity-40 ${
                    removeArmed
                      ? 'bg-red-600 text-white border-red-600 animate-pulse'
                      : 'border-red-200 text-red-500 hover:bg-red-50'
                  }`}
                >
                  {removing ? 'Removing…' : removeArmed ? '⚠ Click again to confirm' : 'Remove All Demo Users'}
                </button>
                {removeArmed && (
                  <p className="text-xs text-gray-400 mt-1 text-right">Will disarm in 4 seconds.</p>
                )}
              </div>
            </div>
          </div>
        )}

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
