import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSessionById, getSessionResponses } from '../lib/api'
import { formatDuration } from '../lib/scoring'
import type { GameSession } from '../types'

type ResponseRow = {
  question_id: string
  selected_option_id: string | null
  correct_option_id: string
  is_correct: boolean
  points_awarded: number
  response_time_ms: number
  prompt: string
  explanation: string | null
  options: { id: string; option_text: string; sort_order: number }[]
}

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()

  const [session, setSession] = useState<GameSession | null>(null)
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      getSessionById(sessionId),
      getSessionResponses(sessionId),
    ]).then(([sess, resp]) => {
      setSession(sess)
      setResponses(resp)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading || !session) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Score header */}
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-indigo-600 uppercase tracking-wider mb-2">Final Score</p>
          <div className="text-7xl font-bold text-gray-900 mb-4">{session.score.toLocaleString()}</div>
          <div className="flex gap-6 justify-center text-sm text-gray-500">
            <span>{session.correct_count} / {session.question_count} correct</span>
            <span>{formatDuration(session.duration_ms)}</span>
          </div>
        </div>

        {/* Question breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Question breakdown</h3>
            <p className="text-xs text-gray-400 mt-0.5">Tap any question to see details</p>
          </div>

          {responses.map((r, i) => {
            const isOpen = expanded === r.question_id
            const timedOut = !r.selected_option_id

            return (
              <div key={r.question_id} className="border-b border-gray-50 last:border-0">
                {/* Summary row — always visible */}
                <button
                  onClick={() => setExpanded(isOpen ? null : r.question_id)}
                  className={`w-full text-left px-5 py-4 flex items-center gap-3 transition-colors ${
                    r.is_correct
                      ? 'bg-green-50 hover:bg-green-100'
                      : 'bg-red-50 hover:bg-red-100'
                  }`}
                >
                  <span className="text-base flex-shrink-0">{r.is_correct ? '✅' : '❌'}</span>
                  <span className="flex-1 text-sm text-gray-800 font-medium line-clamp-1">
                    Q{i + 1}: {r.prompt}
                  </span>
                  <span className="text-sm font-semibold text-gray-700 flex-shrink-0 mr-1">
                    +{r.points_awarded} pts
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-5 pb-5 pt-4 bg-white border-t border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 mb-4">{r.prompt}</p>

                    <div className="space-y-2 mb-4">
                      {r.options.map((opt) => {
                        const isCorrect = opt.id === r.correct_option_id
                        const isSelected = opt.id === r.selected_option_id
                        const isWrongPick = isSelected && !isCorrect

                        let cls = 'border-gray-200 bg-gray-50 text-gray-600'
                        let badge: React.ReactNode = null

                        if (isCorrect && isSelected) {
                          cls = 'border-green-400 bg-green-50 text-green-800'
                          badge = <span className="text-xs font-semibold text-green-700 ml-2 flex-shrink-0">✓ Correct</span>
                        } else if (isCorrect) {
                          cls = 'border-green-400 bg-green-50 text-green-800'
                          badge = <span className="text-xs font-semibold text-green-700 ml-2 flex-shrink-0">✓ Correct answer</span>
                        } else if (isWrongPick) {
                          cls = 'border-red-400 bg-red-50 text-red-800'
                          badge = <span className="text-xs font-semibold text-red-700 ml-2 flex-shrink-0">✗ Your pick</span>
                        }

                        return (
                          <div key={opt.id} className={`flex items-center px-3 py-2.5 rounded-lg border text-sm ${cls}`}>
                            <span className="flex-1">{opt.option_text}</span>
                            {badge}
                          </div>
                        )
                      })}
                    </div>

                    {timedOut && (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                        ⏱ Time ran out — no answer submitted.
                      </p>
                    )}

                    {r.explanation && (
                      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                        💡 {r.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

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
