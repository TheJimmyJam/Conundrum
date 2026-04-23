import { useEffect, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { getMyChallenges } from '../lib/api'
import { formatDuration } from '../lib/scoring'

type FinalizeResult = {
  score: number
  correct_count: number
  duration_ms: number
  question_results: Array<{ question_id: string; is_correct: boolean; points_awarded: number }>
  both_done: boolean
  winner_id: string | null
  opponent_result: { score: number; correct_count: number; duration_ms: number } | null
}

type ChallengeRow = {
  id: string
  status: string
  winner_id: string | null
  challenger: { id: string; username: string; display_name: string | null }
  challenged: { id: string; username: string; display_name: string | null }
  challenger_session: { score: number; correct_count: number; duration_ms: number } | null
  challenged_session: { score: number; correct_count: number; duration_ms: number } | null
}

function displayName(u: { username: string; display_name: string | null }) {
  return u.display_name || u.username
}

export default function ChallengeResultsPage() {
  const { challengeId } = useParams<{ challengeId: string }>()
  const location = useLocation()
  const { user, profile } = useAuthStore()

  // Result can come directly from navigation state (fresh result) or we load it
  const stateResult = (location.state as { result: FinalizeResult } | null)?.result ?? null

  const [result, setResult] = useState<FinalizeResult | null>(stateResult)
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null)
  const [loading, setLoading] = useState(!stateResult)

  useEffect(() => {
    async function load() {
      try {
        const challenges = await getMyChallenges()
        const found = challenges.find((c: any) => c.id === challengeId)
        if (found) setChallenge(found)

        // If no state result, reconstruct from challenge data
        if (!stateResult && found) {
          const iAmChallenger = found.challenger.id === user?.id
          const mySession = iAmChallenger ? found.challenger_session : found.challenged_session
          const opSession = iAmChallenger ? found.challenged_session : found.challenger_session
          if (mySession) {
            setResult({
              score: mySession.score,
              correct_count: mySession.correct_count,
              duration_ms: mySession.duration_ms,
              question_results: [],
              both_done: found.status === 'completed',
              winner_id: found.winner_id,
              opponent_result: opSession ?? null,
            })
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [challengeId])

  if (loading || !result) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
    </div>
  )

  const myName = profile?.display_name || profile?.username || 'You'
  const iAmChallenger = challenge ? challenge.challenger.id === user?.id : true
  const opponentData = challenge ? (iAmChallenger ? challenge.challenged : challenge.challenger) : null
  const opponentName = opponentData ? displayName(opponentData) : 'Opponent'

  const won = result.winner_id === user?.id
  const tied = result.both_done && !result.winner_id
  const lost = result.both_done && result.winner_id && !won

  const myCorrect = result.correct_count
  const myTime = result.duration_ms
  const opCorrect = result.opponent_result?.correct_count ?? null
  const opTime = result.opponent_result?.duration_ms ?? null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Outcome banner */}
        <div className="text-center mb-10">
          {!result.both_done ? (
            <>
              <div className="text-6xl mb-4">⏳</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">You're done!</h1>
              <p className="text-gray-500">Waiting for {opponentName} to play their round.</p>
              <p className="text-sm text-gray-400 mt-1">Check back in the Challenges tab to see the result.</p>
            </>
          ) : tied ? (
            <>
              <div className="text-6xl mb-4">🤝</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">It's a Tie!</h1>
              <p className="text-gray-500">Exactly matched — same correct answers and time.</p>
            </>
          ) : won ? (
            <>
              <div className="text-6xl mb-4">🏆</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">You Won!</h1>
              <p className="text-gray-500">Nice work — you outscored {opponentName}.</p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-4">😤</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">They Got You</h1>
              <p className="text-gray-500">{opponentName} took this one. Challenge them again!</p>
            </>
          )}
        </div>

        {/* Score comparison */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-8">
          <div className="grid grid-cols-2 divide-x divide-gray-100">

            {/* My side */}
            <div className={`px-6 py-8 text-center ${won ? 'bg-green-50' : ''}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {myName} {won && '👑'}
              </p>
              <div className="text-5xl font-bold text-gray-900 mb-3">{result.score.toLocaleString()}</div>
              <div className="space-y-1 text-sm text-gray-500">
                <div>{myCorrect} / 10 correct</div>
                <div>{formatDuration(myTime)}</div>
              </div>
            </div>

            {/* Opponent side */}
            <div className={`px-6 py-8 text-center ${lost ? 'bg-green-50' : ''}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {opponentName} {lost && '👑'}
              </p>
              {result.both_done && result.opponent_result ? (
                <>
                  <div className="text-5xl font-bold text-gray-900 mb-3">
                    {result.opponent_result.score.toLocaleString()}
                  </div>
                  <div className="space-y-1 text-sm text-gray-500">
                    <div>{opCorrect} / 10 correct</div>
                    <div>{opTime !== null ? formatDuration(opTime) : '—'}</div>
                  </div>
                </>
              ) : (
                <div className="text-gray-400 text-sm mt-4">
                  <div className="text-3xl mb-2">⏳</div>
                  Not played yet
                </div>
              )}
            </div>
          </div>

          {/* Tiebreaker note if applicable */}
          {result.both_done && result.opponent_result && myCorrect === opCorrect && !tied && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">Same correct count — decided by speed 🏃</p>
            </div>
          )}
        </div>

        {/* Quick stats breakdown (if we have question results) */}
        {result.question_results.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-8">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Your answers</h3>
            </div>
            <div className="px-5 py-4 flex gap-2 flex-wrap">
              {result.question_results.map((r, i) => (
                <div
                  key={r.question_id}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${
                    r.is_correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}
                  title={`Q${i + 1}: ${r.is_correct ? `+${r.points_awarded} pts` : 'Incorrect'}`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <Link
            to="/friends"
            className="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-xl text-center hover:bg-indigo-700"
          >
            Back to Friends
          </Link>
          <Link
            to="/play"
            className="flex-1 border border-indigo-600 text-indigo-600 font-semibold py-3 rounded-xl text-center hover:bg-indigo-50"
          >
            Play Daily
          </Link>
        </div>

      </div>
    </div>
  )
}
