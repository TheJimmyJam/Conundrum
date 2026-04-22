import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import {
  getTodaysDailySet,
  getMostRecentPublishedDailySet,
  getExistingDailySession,
  createGameSession,
  getDailySetQuestions,
  finalizeSession,
} from '../lib/api'
import { getTierInfo, EINSTEIN_SCALE_NAME } from '../lib/questionTier'
import { msUntilNextReset, formatCountdown } from '../lib/dailyTime'

type Phase = 'loading' | 'already_played' | 'no_set' | 'playing' | 'submitting' | 'error'

export default function PlayPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { sessionId, questions, currentIndex, answers, setSession, setQuestions, startQuestion, recordAnswer, nextQuestion, reset } = useGameStore()

  const [phase, setPhase] = useState<Phase>('loading')
  const [timer, setTimer] = useState(30)
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    const userId = user?.id
    if (!userId || initialized.current) return
    initialized.current = true

    async function init() {
      try {
        let dailySet = await getTodaysDailySet()
        if (!dailySet) dailySet = await getMostRecentPublishedDailySet()
        if (!dailySet) { setPhase('no_set'); return }

        const existing = await getExistingDailySession(userId!, dailySet.id)
        if (existing) { setExistingSessionId(existing.id); setPhase('already_played'); return }

        const session = await createGameSession(userId!, dailySet.id, 'daily')
        const qs = await getDailySetQuestions(dailySet.id)
        setSession(session.id, 'daily')
        setQuestions(qs)
        setPhase('playing')
        startQuestion()
      } catch (err) {
        console.error('PlayPage init error:', err)
        setPhase('error')
      }
    }
    init()
    return () => { reset(); initialized.current = false }
  }, [user?.id])

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return
    setTimer(30)
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          // Auto-submit current question with no answer
          handleAnswer(null)
          return 30
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [currentIndex, phase])

  async function handleAnswer(optionId: string | null) {
    const question = questions[currentIndex]
    if (!question) return

    if (optionId) recordAnswer(question.id, optionId)
    else recordAnswer(question.id, '') // timed out — empty answer

    const isLast = currentIndex >= questions.length - 1

    if (isLast) {
      setPhase('submitting')
      try {
        const result = await finalizeSession({
          session_id: sessionId!,
          answers: [...answers, {
            question_id: question.id,
            selected_option_id: optionId ?? '',
            response_time_ms: Math.max(0, (30 - timer) * 1000),
          }],
        })
        navigate(`/results/${sessionId}`, { state: { result } })
      } catch (err) {
        console.error('finalize-session error:', err)
        setPhase('error')
      }
    } else {
      nextQuestion()
      startQuestion()
    }
  }

  if (phase === 'loading') return <LoadingScreen />
  if (phase === 'no_set') return <NoSetScreen />
  if (phase === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-white mb-3">Something went wrong</h2>
        <p className="text-gray-400 mb-6">There was a problem submitting your answers. Your score may not have been saved.</p>
        <button onClick={() => navigate('/')} className="bg-amber-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-amber-600">
          Go home
        </button>
      </div>
    </div>
  )
  if (phase === 'already_played') return <AlreadyPlayedScreen sessionId={existingSessionId} />

  const question = questions[currentIndex]
  if (!question || phase === 'submitting') return <LoadingScreen label="Calculating score…" />

  const timerPct = (timer / 30) * 100
  const timerColor = timer > 15 ? 'bg-green-500' : timer > 8 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col">
      {/* Header */}
      <div className="bg-[#0f0f1a] border-b border-white/10 px-6 py-4 flex items-center justify-between max-w-2xl mx-auto w-full">
        <span className="text-sm font-medium text-gray-400">Question {currentIndex + 1} of {questions.length}</span>
        <span className={`text-lg font-bold ${timer <= 8 ? 'text-red-600' : 'text-gray-200'}`}>{timer}s</span>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 bg-white/10 max-w-2xl mx-auto w-full">
        <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        {/* Progress dots */}
        <div className="flex gap-2 mb-8">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < currentIndex ? 'bg-amber-500' : i === currentIndex ? 'bg-amber-400' : 'bg-white/10'}`} />
          ))}
        </div>

        {/* Question */}
        <h2 className="text-2xl font-bold text-white mb-3 leading-snug">{question.prompt}</h2>
        {question.difficulty_tier != null && (() => {
          const info = getTierInfo(question.difficulty_tier)
          const pct = question.total_answers
            ? Math.round((question.correct_answers ?? 0) / question.total_answers * 100)
            : null
          return (
            <div className="flex items-center gap-2 mb-6">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${info.color} ${info.textColor} ${info.borderColor}`}>
                {info.name}
              </span>
              <span className="text-xs text-gray-300 font-medium">{EINSTEIN_SCALE_NAME}</span>
              {pct !== null && (
                <span className="text-xs text-gray-400">{pct}% of players got this right</span>
              )}
            </div>
          )
        })()}

        {/* Options */}
        <div className="grid grid-cols-1 gap-3">
          {question.options
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleAnswer(opt.id)}
                className="w-full text-left px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-amber-400 hover:bg-amber-500/10 transition-colors font-medium text-gray-100"
              >
                {opt.option_text}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

function LoadingScreen({ label = 'Loading today\'s round…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent mx-auto mb-4" />
        <p className="text-gray-400 text-sm">{label}</p>
      </div>
    </div>
  )
}

function AlreadyPlayedScreen({ sessionId }: { sessionId: string | null }) {
  const navigate = useNavigate()
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilNextReset()))

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(formatCountdown(msUntilNextReset()))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-white mb-2">You've already played today!</h2>
        <p className="text-gray-400 mb-1">Next round unlocks at <span className="font-semibold text-gray-200">6:00 AM ET</span></p>
        <p className="text-3xl font-bold text-amber-400 font-mono mb-7 tabular-nums">{countdown}</p>
        <div className="flex gap-3 justify-center">
          {sessionId && (
            <button onClick={() => navigate(`/results/${sessionId}`)} className="bg-amber-500 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-amber-600">
              View your results
            </button>
          )}
          <button onClick={() => navigate('/endless')} className="border border-amber-500 text-amber-400 px-6 py-2.5 rounded-lg font-medium hover:bg-amber-500/10">
            Play Endless Mode
          </button>
        </div>
      </div>
    </div>
  )
}

function NoSetScreen() {
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilNextReset()))

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(formatCountdown(msUntilNextReset()))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">🕐</div>
        <h2 className="text-2xl font-bold text-white mb-2">No round available yet.</h2>
        <p className="text-gray-400 mb-1">New rounds unlock at <span className="font-semibold text-gray-200">6:00 AM ET</span></p>
        <p className="text-3xl font-bold text-amber-400 font-mono tabular-nums mb-6">{countdown}</p>
        <button onClick={() => window.location.href = '/endless'} className="border border-amber-500 text-amber-400 px-6 py-2.5 rounded-lg font-medium hover:bg-amber-500/10">
          Play Endless Mode
        </button>
      </div>
    </div>
  )
}
