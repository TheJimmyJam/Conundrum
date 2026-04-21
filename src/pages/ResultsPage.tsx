import { useEffect, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { getSessionById } from '../lib/api'
import { formatDuration } from '../lib/scoring'
import type { GameSession, FinalizeSessionResult } from '../types'

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const location = useLocation()
  const result = (location.state as any)?.result as FinalizeSessionResult | undefined

  const [session, setSession] = useState<GameSession | null>(null)

  useEffect(() => {
    if (sessionId) getSessionById(sessionId).then(setSession)
  }, [sessionId])

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Score */}
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-indigo-600 uppercase tracking-wider mb-2">Final Score</p>
          <div className="text-7xl font-bold text-gray-900 mb-4">{session.score}</div>
          <div className="flex gap-6 justify-center text-sm text-gray-500">
            <span>{session.correct_count} / {session.question_count} correct</span>
            <span>{formatDuration(session.duration_ms)}</span>
          </div>
        </div>

        {/* Question breakdown */}
        {result && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-8">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Question breakdown</h3>
            </div>
            {result.question_results.map((qr, i) => (
              <div key={qr.question_id} className={`px-5 py-4 flex items-center justify-between border-b border-gray-50 last:border-0 ${qr.is_correct ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-lg ${qr.is_correct ? '✅' : '❌'}`}>{qr.is_correct ? '✅' : '❌'}</span>
                  <span className="text-sm text-gray-700">Question {i + 1}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">+{qr.points_awarded} pts</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <Link to="/leaderboard" className="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-xl text-center hover:bg-indigo-700">
            View Leaderboard
          </Link>
          <Link to="/endless" className="flex-1 border border-indigo-600 text-indigo-600 font-semibold py-3 rounded-xl text-center hover:bg-indigo-50">
            Play Endless Mode
          </Link>
        </div>
      </div>
    </div>
  )
}
