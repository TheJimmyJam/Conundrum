import { useEffect, useState } from 'react'
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom'
import { getSessionById } from '../lib/api'
import { formatDuration } from '../lib/scoring'
import { useAuthStore } from '../store/authStore'
import type { GameSession } from '../types'

export default function EndlessResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const result = (location.state as any)?.result
  const { } = useAuthStore()

  const [session, setSession] = useState<GameSession | null>(null)

  useEffect(() => {
    if (sessionId) getSessionById(sessionId).then(setSession)
  }, [sessionId])

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent" />
    </div>
  )

  const isNewBest = result?.is_new_personal_best

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {isNewBest && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3 mb-6 text-center">
            <span className="text-yellow-700 font-semibold">🏆 New personal best for this category!</span>
          </div>
        )}

        <div className="text-center mb-10">
          <p className="text-sm font-medium text-amber-400 uppercase tracking-wider mb-2">Endless Session Complete</p>
          <div className="text-7xl font-bold text-white mb-4">{session.score}</div>
          <div className="flex gap-6 justify-center text-sm text-gray-400 flex-wrap">
            <span>{session.question_count} questions</span>
            <span>{session.correct_count} correct</span>
            <span>🔥 Best streak: {session.longest_streak}</span>
            <span>{formatDuration(session.duration_ms)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => navigate('/endless', { state: { replayCategory: session.category_id } })}
            className="flex-1 bg-amber-500 text-white font-semibold py-3 rounded-xl text-center hover:bg-amber-600"
          >
            Play Again
          </button>
          <Link
            to="/endless"
            className="flex-1 border border-amber-500 text-amber-400 font-semibold py-3 rounded-xl text-center hover:bg-amber-500/10"
          >
            Try Another Category
          </Link>
          <Link
            to="/play"
            className="flex-1 border border-white/10 text-gray-200 font-semibold py-3 rounded-xl text-center hover:bg-white/5"
          >
            Go to Daily Round
          </Link>
        </div>
      </div>
    </div>
  )
}
