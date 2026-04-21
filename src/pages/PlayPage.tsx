import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import {
  getTodaysDailySet,
  getExistingDailySession,
  createGameSession,
  getDailySetQuestions,
  finalizeSession,
} from '../lib/api'

type Phase = 'loading' | 'already_played' | 'no_set' | 'playing' | 'submitting' | 'error'

export default function PlayPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { sessionId, questions, currentIndex, answers, setSession, setQuestions, startQuestion, recordAnswer, nextQuestion, reset } = useGameStore()

  const [phase, setPhase] = useState<Phase>('loading')
  const [timer, setTimer] = useState(15)
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    const userId = user?.id
    if (!userId || initialized.current) return
    initialized.current = true

    async function init() {
      try {
        const dailySet = await getTodaysDailySet()
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
    setTimer(15)
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          // Auto-submit current question with no answer
          handleAnswer(null)
          return 15
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
            response_time_ms: Math.max(0, (15 - timer) * 1000),
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h2>
        <p className="text-gray-500 mb-6">There was a problem submitting your answers. Your score may not have been saved.</p>
        <button onClick={() => navigate('/')} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700">
          Go home
        </button>
      </div>
    </div>
  )
  if (phase === 'already_played') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">You've already played today!</h2>
        <p className="text-gray-500 mb-6">Come back tomorrow for a fresh set.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate(`/results/${existingSessionId}`)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700">
            View your results
          </button>
          <button onClick={() => navigate('/endless')} className="border border-indigo-600 text-indigo-600 px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-50">
            Play Endless Mode
          </button>
        </div>
      </div>
    </div>
  )

  const question = questions[currentIndex]
  if (!question || phase === 'submitting') return <LoadingScreen label="Calculating score…" />

  const timerPct = (timer / 15) * 100
  const timerColor = timer > 8 ? 'bg-green-500' : timer > 4 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-2xl mx-auto w-full">
        <span className="text-sm font-medium text-gray-500">Question {currentIndex + 1} of {questions.length}</span>
        <span className={`text-lg font-bold ${timer <= 4 ? 'text-red-600' : 'text-gray-700'}`}>{timer}s</span>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 bg-gray-200 max-w-2xl mx-auto w-full">
        <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        {/* Progress dots */}
        <div className="flex gap-2 mb-8">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < currentIndex ? 'bg-indigo-600' : i === currentIndex ? 'bg-indigo-300' : 'bg-gray-200'}`} />
          ))}
        </div>

        {/* Question */}
        <h2 className="text-2xl font-bold text-gray-900 mb-8 leading-snug">{question.prompt}</h2>

        {/* Options */}
        <div className="grid grid-cols-1 gap-3">
          {question.options
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleAnswer(opt.id)}
                className="w-full text-left px-5 py-4 rounded-xl border border-gray-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 transition-colors font-medium text-gray-800"
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
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent mx-auto mb-4" />
        <p className="text-gray-500 text-sm">{label}</p>
      </div>
    </div>
  )
}

function NoSetScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">🕐</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">No trivia set today — yet.</h2>
        <p className="text-gray-500">Check back soon. Today's round is being prepared.</p>
      </div>
    </div>
  )
}
