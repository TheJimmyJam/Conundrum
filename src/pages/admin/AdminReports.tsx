import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminGetDailyPlayers, adminResetDailySession } from '../../lib/api'

type Player = {
  session_id: string
  user_id: string
  username: string
  display_name: string | null
  score: number
  correct_count: number
  completed_at: string
  anti_cheat_flag: boolean
}

export default function AdminReports() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [date])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGetDailyPlayers(date)
      setPlayers(data)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load players')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(player: Player) {
    const confirmed = confirm(
      `Reset @${player.username}'s session for ${date}?\n\nThis will delete their score and responses. They'll be able to play this day's set again from scratch.`
    )
    if (!confirmed) return

    setResetting(player.session_id)
    try {
      await adminResetDailySession(player.session_id)
      setPlayers((prev) => prev.filter((p) => p.session_id !== player.session_id))
    } catch (err: any) {
      alert(err?.message ?? 'Failed to reset session')
    } finally {
      setResetting(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 mb-6">
          ← Admin
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">Reports</h1>
        <p className="text-gray-400 mb-10">View who played the daily, reset individual sessions, and review anti-cheat flags.</p>

        {/* Daily Session Reset */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">Daily Players</h2>
              <p className="text-sm text-gray-400 mt-0.5">Reset a player's session so they can play again.</p>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-red-500 text-sm">{error}</p>
              <button onClick={load} className="mt-3 text-sm text-amber-400 hover:underline">Try again</button>
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-3xl mb-2">🏜</div>
              <p className="text-sm">No completed daily sessions for {date}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-400 text-xs uppercase tracking-wide">Rank</th>
                    <th className="text-left py-2 pr-4 font-semibold text-gray-400 text-xs uppercase tracking-wide">Player</th>
                    <th className="text-right py-2 pr-4 font-semibold text-gray-400 text-xs uppercase tracking-wide">Score</th>
                    <th className="text-right py-2 pr-4 font-semibold text-gray-400 text-xs uppercase tracking-wide">Correct</th>
                    <th className="text-right py-2 pr-4 font-semibold text-gray-400 text-xs uppercase tracking-wide">Completed</th>
                    <th className="text-right py-2 font-semibold text-gray-400 text-xs uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p.session_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-4 text-gray-400 font-medium">#{i + 1}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-semibold text-white">
                              {p.display_name ?? p.username}
                            </span>
                            <span className="text-gray-400 ml-1">@{p.username}</span>
                          </div>
                          {p.anti_cheat_flag && (
                            <span className="text-xs bg-red-100 text-red-400 font-semibold px-2 py-0.5 rounded-full">⚠ flagged</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right font-bold text-white">{p.score.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-gray-300">{p.correct_count}/10</td>
                      <td className="py-3 pr-4 text-right text-gray-400 text-xs">
                        {new Date(p.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleReset(p)}
                          disabled={resetting === p.session_id}
                          className="text-xs border border-red-500/30 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                        >
                          {resetting === p.session_id ? 'Resetting…' : 'Reset'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-4">{players.length} player{players.length !== 1 ? 's' : ''} completed on {date}.</p>
            </div>
          )}
        </section>

        {/* Anti-cheat — Phase 4 placeholder */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-6 opacity-60">
          <h2 className="text-lg font-bold text-white mb-1">Anti-Cheat Review</h2>
          <p className="text-sm text-gray-400">Detailed flagged session review coming in Phase 4. For now, flagged sessions are marked in the table above.</p>
        </section>
      </div>
    </div>
  )
}
