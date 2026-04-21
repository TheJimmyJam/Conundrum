import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDailyLeaderboard, getTodaysDailySet } from '../lib/api'
import { formatDuration } from '../lib/scoring'
import { useAuthStore } from '../store/authStore'
import type { LeaderboardEntry } from '../types'

export default function LeaderboardPage() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const set = await getTodaysDailySet()
      if (!set) { setLoading(false); return }
      const data = await getDailyLeaderboard(set.id)
      setEntries(data)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Leaderboard</h1>
            <p className="text-gray-500 text-sm mt-1">Today's top scores</p>
          </div>
          <Link to="/" className="text-sm text-indigo-600 hover:underline">← Home</Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No scores yet today. Be the first!</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {entries.map((entry) => {
              const isMe = entry.user_id === user?.id
              return (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 ${isMe ? 'bg-indigo-50' : ''}`}
                >
                  <span className={`w-8 text-center font-bold ${entry.rank <= 3 ? 'text-yellow-500' : 'text-gray-400'} text-lg`}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">
                      {entry.display_name ?? entry.username}
                      {isMe && <span className="ml-2 text-xs text-indigo-600 font-normal">(you)</span>}
                    </p>
                    <p className="text-xs text-gray-400">{entry.correct_count}/10 correct · {formatDuration(entry.duration_ms)}</p>
                  </div>
                  <span className="font-bold text-gray-900">{entry.score}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
