import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminSearchPlayers,
  adminResetPlayerDaily,
  adminResetPlayerLifetime,
  adminSetPlayerStatus,
  adminUpdatePlayerProfile,
  adminGenerateDemoUsers,
  adminRemoveDemoUsers,
  adminCountDemoUsers,
  type AdminPlayer,
} from '../../lib/api'

type ConfirmKey = `${'daily' | 'lifetime' | 'ban' | 'freeze'}-${string}`

const DEMO_COUNT_OPTIONS = [50, 100, 150, 200]

function StatusBadge({ status }: { status: AdminPlayer['status'] }) {
  if (status === 'banned') return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/100/15 text-red-400 border border-red-500/30">🚫 Banned</span>
  )
  if (status === 'frozen') return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/100/15 text-blue-400 border border-blue-400/40">🧊 Frozen</span>
  )
  return null
}

export default function AdminPlayers() {
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [hideDemos, setHideDemos] = useState(true)

  // Double-confirm state
  const [armed, setArmed] = useState<ConfirmKey | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Profile editing
  const [editingProfile, setEditingProfile] = useState<string | null>(null)
  const [editDisplay, setEditDisplay] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Demo data panel
  const [showDemo, setShowDemo] = useState(false)
  const [demoCount, setDemoCount] = useState(150)
  const [demoUserCount, setDemoUserCount] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeArmed, setRemoveArmed] = useState(false)
  const removeArmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { search('') }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 350)
    return () => clearTimeout(t)
  }, [query])

  async function search(q: string) {
    setLoading(true)
    try { setPlayers(await adminSearchPlayers(q)) }
    catch (err: any) {
      console.error('adminSearchPlayers error:', err)
      showToast(`✗ ${err?.message ?? err?.error_description ?? JSON.stringify(err) ?? 'Failed to load players'}`)
    }
    finally { setLoading(false) }
  }

  function armAction(key: ConfirmKey) {
    if (armTimer.current) clearTimeout(armTimer.current)
    setArmed(key)
    armTimer.current = setTimeout(() => setArmed(null), 3000)
  }

  async function handleReset(userId: string, action: 'daily' | 'lifetime') {
    const key: ConfirmKey = `${action}-${userId}`
    if (armed !== key) { armAction(key); return }
    if (armTimer.current) clearTimeout(armTimer.current)
    setArmed(null)
    setActing(key)
    try {
      const count = action === 'daily'
        ? await adminResetPlayerDaily(userId)
        : await adminResetPlayerLifetime(userId)
      const label = action === 'daily' ? 'daily session' : 'lifetime scores'
      showToast(`✓ Reset ${label} — ${count} session${count !== 1 ? 's' : ''} removed.`)
      setPlayers(await adminSearchPlayers(query))
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally { setActing(null) }
  }

  async function handleSetStatus(userId: string, status: 'active' | 'banned' | 'frozen') {
    const action = status === 'banned' ? 'ban' : status === 'frozen' ? 'freeze' : 'ban'
    const key: ConfirmKey = `${action}-${userId}`
    if (status !== 'active' && armed !== key) { armAction(key); return }
    if (armTimer.current) clearTimeout(armTimer.current)
    setArmed(null)
    setActing(key)
    try {
      await adminSetPlayerStatus(userId, status)
      const label = status === 'active' ? 'reactivated' : status === 'banned' ? 'banned' : 'frozen'
      showToast(`✓ Player ${label}.`)
      setPlayers(prev => prev.map(p => p.id === userId ? { ...p, status } : p))
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally { setActing(null) }
  }

  function startEditProfile(p: AdminPlayer) {
    setEditingProfile(p.id)
    setEditDisplay(p.display_name ?? '')
    setEditUsername(p.username)
  }

  async function handleSaveProfile(userId: string) {
    setSavingProfile(true)
    try {
      await adminUpdatePlayerProfile(userId, editDisplay, editUsername)
      showToast('✓ Profile updated.')
      setPlayers(prev => prev.map(p => p.id === userId
        ? { ...p, display_name: editDisplay || null, username: editUsername }
        : p
      ))
      setEditingProfile(null)
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally { setSavingProfile(false) }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function openDemoPanel() {
    setShowDemo(true)
    try { setDemoUserCount(await adminCountDemoUsers()) } catch { /* ignore */ }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const result = await adminGenerateDemoUsers(demoCount)
      setDemoUserCount((demoUserCount ?? 0) + result.generated)
      showToast(`✓ Generated ${result.generated} demo users for ${result.daily_set_date}.`)
      search(query)
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally { setGenerating(false) }
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
    } finally { setRemoving(false) }
  }

  const displayed = hideDemos ? players.filter(p => !p.is_demo) : players
  const realCount = players.filter(p => !p.is_demo).length
  const demoShown = players.filter(p => p.is_demo).length

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 mb-6">
          ← Admin
        </Link>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-white">Players</h1>
          <button
            onClick={openDemoPanel}
            className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/10 flex items-center gap-2"
          >
            🎭 Demo Data
          </button>
        </div>
        <p className="text-gray-400 mb-6">Search by name, username, or email. Expand a player to manage their account.</p>

        {/* Demo Data Panel */}
        {showDemo && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">🎭 Demo Data</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Fake users · @demo.conundrum.test emails
                  {demoUserCount !== null && (
                    <span className="ml-2 font-semibold text-purple-400">{demoUserCount} active</span>
                  )}
                </p>
              </div>
              <button onClick={() => setShowDemo(false)} className="text-gray-400 hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1.5">Count</p>
                <div className="flex gap-1.5">
                  {DEMO_COUNT_OPTIONS.map(n => (
                    <button key={n} onClick={() => setDemoCount(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${demoCount === n ? 'bg-purple-600 text-white border-purple-600' : 'border-white/10 text-gray-300 hover:border-purple-400'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleGenerate} disabled={generating || removing}
                className="bg-purple-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-purple-700 disabled:opacity-50">
                {generating ? 'Generating…' : `Generate ${demoCount} users`}
              </button>
              <div className="ml-auto">
                <button onClick={handleRemoveDemo} disabled={removing || generating || demoUserCount === 0}
                  className={`text-sm px-4 py-2.5 rounded-xl border font-medium transition-all disabled:opacity-40 ${removeArmed ? 'bg-red-600 text-white border-red-600 animate-pulse' : 'border-red-500/30 text-red-500 hover:bg-red-500/10'}`}>
                  {removing ? 'Removing…' : removeArmed ? '⚠ Click again to confirm' : 'Remove All Demo Users'}
                </button>
                {removeArmed && <p className="text-xs text-gray-400 mt-1 text-right">Disarms in 4s.</p>}
              </div>
            </div>
          </div>
        )}

        {/* Search + filter */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input type="text" placeholder="Search by name, username, or email…" value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-[#0f0f1a]" />
            {loading && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-500 border-t-transparent" />
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer whitespace-nowrap select-none">
            <input type="checkbox" checked={hideDemos} onChange={e => setHideDemos(e.target.checked)} className="accent-indigo-600" />
            Hide demo users
          </label>
        </div>

        {/* Player list */}
        {displayed.length === 0 && !loading ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-16 text-center">
            <div className="text-3xl mb-2">👤</div>
            <p className="text-gray-400 text-sm">No players found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(p => {
              const isOpen = expanded === p.id
              const dailyKey: ConfirmKey = `daily-${p.id}`
              const lifetimeKey: ConfirmKey = `lifetime-${p.id}`
              const banKey: ConfirmKey = `ban-${p.id}`
              const freezeKey: ConfirmKey = `freeze-${p.id}`
              const isActing = acting?.endsWith(p.id) ?? false
              const isEditingThis = editingProfile === p.id

              const statusBorderColor = p.status === 'banned' ? 'border-red-500/30' : p.status === 'frozen' ? 'border-blue-400/30' : 'border-white/10'

              return (
                <div key={p.id} className={`bg-white/5 border ${statusBorderColor} rounded-2xl overflow-hidden`}>
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-full font-bold text-sm flex items-center justify-center flex-shrink-0 ${
                      p.status === 'banned' ? 'bg-red-500/100/15 text-red-400' :
                      p.status === 'frozen' ? 'bg-blue-500/100/15 text-blue-400' :
                      'bg-amber-500/100/15 text-amber-400'
                    }`}>
                      {(p.display_name ?? p.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-white text-sm">{p.display_name ?? p.username}</p>
                        {p.role === 'admin' && (
                          <span className="text-xs bg-amber-500/100/15 text-amber-400 font-semibold px-1.5 py-0.5 rounded">admin</span>
                        )}
                        {p.is_demo && (
                          <span className="text-xs bg-purple-500/15 text-purple-400 font-semibold px-1.5 py-0.5 rounded">demo</span>
                        )}
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-xs text-gray-400 truncate">@{p.username} · {p.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <p className="text-sm font-semibold text-gray-200">{p.games_played} games</p>
                      <p className="text-xs text-gray-400">best {p.best_score?.toLocaleString() ?? '—'}</p>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div className="border-t border-white/10 px-5 py-5 space-y-5">

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-white/5 rounded-xl py-3">
                          <p className="text-xl font-bold text-white">{p.games_played}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Games</p>
                        </div>
                        <div className="bg-white/5 rounded-xl py-3">
                          <p className="text-xl font-bold text-white">{p.best_score?.toLocaleString() ?? '—'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Best Score</p>
                        </div>
                        <div className="bg-white/5 rounded-xl py-3">
                          <p className="text-xs font-medium text-gray-200 mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Joined</p>
                        </div>
                      </div>

                      {/* Profile editing */}
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Profile</p>
                        {isEditingThis ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Display name</label>
                                <input value={editDisplay} onChange={e => setEditDisplay(e.target.value)}
                                  placeholder="Display name"
                                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Username</label>
                                <input value={editUsername} onChange={e => setEditUsername(e.target.value)}
                                  placeholder="username"
                                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleSaveProfile(p.id)} disabled={savingProfile || !editUsername.trim()}
                                className="text-xs bg-amber-500/100 text-white px-4 py-2 rounded-lg hover:bg-amber-600 disabled:opacity-50 font-semibold">
                                {savingProfile ? 'Saving…' : 'Save'}
                              </button>
                              <button onClick={() => setEditingProfile(null)}
                                className="text-xs border border-white/10 text-gray-400 px-4 py-2 rounded-lg hover:bg-white/5">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-300">
                              <span className="font-medium">{p.display_name ?? <span className="text-gray-400 italic">no display name</span>}</span>
                              <span className="text-gray-400 mx-2">·</span>
                              <span className="text-gray-400">@{p.username}</span>
                            </div>
                            <button onClick={() => startEditProfile(p)}
                              className="text-xs border border-white/10 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-white/5">
                              ✏ Edit
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Score management */}
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Score Management</p>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => handleReset(p.id, 'daily')} disabled={isActing}
                            className={`text-sm px-4 py-2 rounded-lg border font-medium transition-all disabled:opacity-40 ${armed === dailyKey ? 'bg-orange-500 text-white border-orange-500 animate-pulse' : 'border-orange-400/40 text-orange-400 hover:bg-orange-500/10'}`}>
                            {acting === dailyKey ? 'Resetting…' : armed === dailyKey ? '⚠ Confirm' : 'Reset Daily'}
                          </button>
                          <button onClick={() => handleReset(p.id, 'lifetime')} disabled={isActing}
                            className={`text-sm px-4 py-2 rounded-lg border font-medium transition-all disabled:opacity-40 ${armed === lifetimeKey ? 'bg-red-600 text-white border-red-600 animate-pulse' : 'border-red-500/30 text-red-500 hover:bg-red-500/10'}`}>
                            {acting === lifetimeKey ? 'Resetting…' : armed === lifetimeKey ? '⚠ Confirm' : 'Reset Lifetime'}
                          </button>
                        </div>
                      </div>

                      {/* Account status */}
                      {p.role !== 'admin' && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Account Status</p>
                          <div className="flex flex-wrap gap-2">
                            {p.status !== 'active' && (
                              <button onClick={() => handleSetStatus(p.id, 'active')} disabled={isActing}
                                className="text-sm px-4 py-2 rounded-lg border font-medium border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-40">
                                {acting === `ban-${p.id}` ? 'Updating…' : '✓ Reactivate'}
                              </button>
                            )}
                            {p.status !== 'frozen' && (
                              <button onClick={() => handleSetStatus(p.id, 'frozen')} disabled={isActing}
                                className={`text-sm px-4 py-2 rounded-lg border font-medium transition-all disabled:opacity-40 ${armed === freezeKey ? 'bg-blue-500 text-white border-blue-500 animate-pulse' : 'border-blue-400/40 text-blue-400 hover:bg-blue-500/10'}`}>
                                {acting === `freeze-${p.id}` ? 'Freezing…' : armed === freezeKey ? '⚠ Confirm Freeze' : '🧊 Freeze'}
                              </button>
                            )}
                            {p.status !== 'banned' && (
                              <button onClick={() => handleSetStatus(p.id, 'banned')} disabled={isActing}
                                className={`text-sm px-4 py-2 rounded-lg border font-medium transition-all disabled:opacity-40 ${armed === banKey ? 'bg-red-700 text-white border-red-700 animate-pulse' : 'border-red-500/30 text-red-400 hover:bg-red-500/10'}`}>
                                {acting === `ban-${p.id}` ? 'Banning…' : armed === banKey ? '⚠ Confirm Ban' : '🚫 Ban'}
                              </button>
                            )}
                          </div>
                          {(armed === banKey || armed === freezeKey) && (
                            <p className="text-xs text-gray-400 mt-2">Button disarms in 3 seconds if not confirmed.</p>
                          )}
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 text-center">
          {realCount} real player{realCount !== 1 ? 's' : ''}
          {demoShown > 0 && !hideDemos && ` · ${demoShown} demo`}
          {hideDemos && demoShown > 0 && ` · ${demoShown} demo hidden`}
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
