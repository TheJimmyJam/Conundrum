import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import { startChallenge, finalizeChallenge } from '../lib/api'
import type { QuestionWithOptions } from '../types'

type Phase = 'loading' | 'playing' | 'submitting' | 'error'

type LocationState = {
  session_id: string
  questions: QuestionWithOptions[]
} | null

export default function ChallengePlayPage() {
  const { challengeId } = useParams<{ challengeId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    sessionId, questions, currentIndex, answers,
    setSession, setQuestions, startQuestion, recordAnswer, nextQuestion, reset,
  } = useGameStore()

  const [phase, setPhase] = useState<Phase>('loading')
  const [timer, setTimer] = useState(20)
  const [challengeSessionId, setChallengeSessionId] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    const userId = user?.id
    if (!userId || !challengeId || initialized.current) return
    initialized.current = true

    async function init() {
      try {
        const state = location.state as LocationState

        let sessionIdToUse: string
        let questionsToUse: QuestionWithOptions[]

        if (state?.session_id && state?.questions?.length) {
          // Challenger flow: questions passed from createChallenge
          sessionIdToUse = state.session_id
          questionsToUse = state.questions
        } else {
          // Challenged flow: call startChallenge to get session + questions
          const result = await startChallenge(challengeId!)
          sessionIdToUse = result.session_id
          questionsToUse = result.questions
        }

        setChallengeSessionId(sessionIdToUse)
        setSession(sessionIdToUse, 'daily') // reuse daily mode for gameStore
        setQuestions(questionsToUse)
        setPhase('playing')
        startQuestion()
      } catch (err) {
        console.error('ChallengePlayPage init error:', err)
        setPhase('error')
      }
    }

    init()
    return () => { reset(); initialized.current = false }
  }, [user?.id, challengeId])

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return
    setTimer(20)
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          handleAnswer(null)
          return 20
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
    else recordAnswer(question.id, '')

    const isLast = currentIndex >= questions.length - 1

    if (isLast) {
      setPhase('submitting')
      try {
        const allAnswers = [
          ...answers,
          {
            question_id: question.id,
            selected_option_id: optionId ?? '',
            response_time_ms: Math.max(0, (20 - timer) * 1000),
          },
        ]
        const result = await finalizeChallenge({
          challenge_id: challengeId!,
          session_id: challengeSessionId ?? sessionId!,
          answers: allAnswers,
        })
        navigate(`/challenge/${challengeId}/results`, { state: { result } })
      } catch (err) {
        console.error('finalize-challenge error:', err)
        setPhase('error')
      }
    } else {
      nextQuestion()
      startQuestion()
    }
  }

  if (phase === 'loading') return <LoadingScreen label="Setting up challenge…" />
  if (phase === 'submitting') return <LoadingScreen label="Calculating results…" />

  if (phase === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h2>
        <p className="text-gray-500 mb-6">There was a problem with this challenge. Your score may not have been saved.</p>
        <button onClick={() => navigate('/friends')} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700">
          Back to Friends
        </button>
      </div>
    </div>
  )

  const question = questions[currentIndex]
  if (!question) return <LoadingScreen />

  const timerPct = (timer / 20) * 100
  const timerColor = timer > 10 ? 'bg-green-500' : timer > 5 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-2xl mx-auto w-full">
        <div>
          <span className="text-sm font-medium text-gray-500">Question {currentIndex + 1} of {questions.length}</span>
          <span className="ml-3 text-xs bg-indigo-50 text-indigo-600 font-medium px-2 py-0.5 rounded-full">⚔️ Challenge</span>
        </div>
        <span className={`text-lg font-bold ${timer <= 5 ? 'text-red-600' : 'text-gray-700'}`}>{timer}s</span>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 bg-gray-200 max-w-2xl mx-auto w-full">
        <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        {/* Progress dots */}
        <div className="flex gap-2 mb-8">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${
              i < currentIndex ? 'bg-indigo-600' : i === currentIndex ? 'bg-indigo-300' : 'bg-gray-200'
            }`} />
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

function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent mx-auto mb-4" />
        <p className="text-gray-500 text-sm">{label}</p>
      </div>
    </div>
  )
}
