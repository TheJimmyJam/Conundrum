import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMySessionHistory } from '../lib/api'
import { formatDuration } from '../lib/scoring'
import { useAuthStore } from '../store/authStore'
import type { GameSession } from '../types'

export default function HistoryPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    getMySessionHistory(user.id)
      .then((data) => setSessions(data))
      .catch((err) => console.error('Failed to load history:', err))
      .finally(() => setLoading(false))
  }, [user])

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Game History</h1>
          <Link to="/profile" className="text-sm text-amber-400 hover:underline">← Profile</Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center text-gray-400 py-20">No games yet. Play your first round!</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/results/${s.id}`)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between hover:border-amber-500/30 transition-colors text-left"
              >
                <div>
                  <p className="font-semibold text-white text-sm">
                    {s.mode === 'endless' ? '♾ Endless' : '📅 Daily'} · {new Date(s.completed_at!).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.correct_count}/{s.question_count} correct · {formatDuration(s.duration_ms)}</p>
                </div>
                <span className="font-bold text-white text-lg">{s.score}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
