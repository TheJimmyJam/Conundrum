import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getNextEndlessQuestion, submitEndlessAnswer, endEndlessSession } from '../lib/api'
import { useGameStore } from '../store/gameStore'
import type { QuestionWithOptions } from '../types'

type Phase = 'loading' | 'question' | 'feedback' | 'done' | 'quitting' | 'error'

export default function EndlessPlayPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionId = (location.state as any)?.sessionId as string

  const { runningScore, streakCount, updateRunningScore, reset } = useGameStore()

  const [phase, setPhase] = useState<Phase>('loading')
  const [question, setQuestion] = useState<QuestionWithOptions | null>(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [timer, setTimer] = useState(15)
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean
    correctOptionId: string
    selectedOptionId: string
    pointsAwarded: number
    explanation: string | null
  } | null>(null)
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)

  const loadNextQuestion = useCallback(async () => {
    setPhase('loading')
    setPendingOptionId(null)
    try {
      const result = await getNextEndlessQuestion(sessionId)
      if (result.done) {
        await finishSession()
      } else {
        setQuestion(result.question!)
        setQuestionCount((c) => c + 1)
        setTimer(15)
        setPhase('question')
      }
    } catch (err) {
      console.error('Failed to load question:', err)
      setPhase('error')
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) { navigate('/endless'); return }
    loadNextQuestion()
    return () => reset()
  }, [sessionId])

  // Timer
  useEffect(() => {
    if (phase !== 'question') return
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) { handleAnswer(null); return 15 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, question])

  async function handleAnswer(optionId: string | null) {
    if (!question || phase !== 'question') return

    // Immediately lock input and show which option was tapped
    setPhase('feedback')
    setPendingOptionId(optionId)

    const responseTimeMs = Math.max(0, (15 - timer) * 1000)
    const result = await submitEndlessAnswer({
      session_id: sessionId,
      question_id: question.id,
      selected_option_id: optionId ?? '',
      response_time_ms: responseTimeMs,
    })

    // Server responded — swap from pending highlight to correct/wrong colors
    setPendingOptionId(null)
    setFeedback({
      isCorrect: result.is_correct,
      correctOptionId: result.correct_option_id,
      selectedOptionId: optionId ?? '',
      pointsAwarded: result.points_awarded,
      explanation: result.explanation,
    })
    updateRunningScore(result.points_awarded, result.is_correct)

    // Auto-advance after 2s
    setTimeout(() => {
      setFeedback(null)
      loadNextQuestion()
    }, 2000)
  }

  async function finishSession() {
    setPhase('done')
    const result = await endEndlessSession(sessionId)
    navigate(`/endless/results/${sessionId}`, { state: { result } })
  }

  async function handleQuit() {
    setPhase('quitting')
    const result = await endEndlessSession(sessionId)
    navigate(`/endless/results/${sessionId}`, { state: { result } })
  }

  if (phase === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Couldn't load a question</h2>
        <p className="text-gray-500 text-sm mb-6">Something went wrong fetching your next question. Try again.</p>
        <button
          onClick={() => loadNextQuestion()}
          className="bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700"
        >
          Try again
        </button>
      </div>
    </div>
  )

  if (phase === 'loading' || phase === 'done') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
    </div>
  )

  if (phase === 'quitting') return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Saving your progress…</p>
    </div>
  )

  const timerPct = (timer / 15) * 100
  const timerColor = timer > 8 ? 'bg-green-500' : timer > 4 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-2xl mx-auto w-full">
        <div className="flex gap-4 text-sm">
          <span className="font-semibold text-gray-700">Q {questionCount}</span>
          {streakCount >= 2 && <span className="text-orange-500 font-medium">🔥 {streakCount} streak</span>}
        </div>
        <span className="font-bold text-indigo-700">{runningScore} pts</span>
        <div className="flex items-center gap-3">
          <span className={`text-lg font-bold ${timer <= 4 ? 'text-red-600' : 'text-gray-700'}`}>{timer}s</span>
          <button
            onClick={() => setShowQuitConfirm(true)}
            className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-3 py-1 rounded-lg"
          >
            Quit
          </button>
        </div>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 bg-gray-200 max-w-2xl mx-auto w-full">
        <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        {question && (
          <>
            {/* Category + difficulty badge */}
            <div className="flex items-center gap-2 mb-4">
              {question.category_name && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                  {question.category_name}
                </span>
              )}
              {question.difficulty && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  question.difficulty === 'easy'   ? 'bg-green-100 text-green-700' :
                  question.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                     'bg-red-100 text-red-700'
                }`}>
                  {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
                </span>
              )}
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-8 leading-snug">{question.prompt}</h2>
            <div className="grid grid-cols-1 gap-3">
              {question.options
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((opt) => {
                  let style = 'border border-gray-200 bg-white hover:border-indigo-400 hover:bg-indigo-50'

                  if (feedback) {
                    // Server responded — show definitive correct/wrong
                    if (opt.id === feedback.correctOptionId) style = 'border-2 border-green-500 bg-green-50'
                    else if (opt.id === feedback.selectedOptionId && !feedback.isCorrect) style = 'border-2 border-red-400 bg-red-50'
                    else style = 'border border-gray-100 bg-white opacity-40'
                  } else if (pendingOptionId !== null) {
                    // Waiting on server — show immediate selection highlight
                    if (opt.id === pendingOptionId) style = 'border-2 border-indigo-500 bg-indigo-50'
                    else style = 'border border-gray-100 bg-white opacity-40'
                  }

                  return (
                    <button
                      key={opt.id}
                      onClick={() => phase === 'question' && handleAnswer(opt.id)}
                      disabled={phase !== 'question'}
                      className={`w-full text-left px-5 py-4 rounded-xl transition-colors font-medium text-gray-800 ${style}`}
                    >
                      {opt.option_text}
                    </button>
                  )
                })}
            </div>
            {feedback?.explanation && (
              <p className="mt-4 text-sm text-gray-500 italic">{feedback.explanation}</p>
            )}
          </>
        )}
      </div>

      {/* Quit confirm */}
      {showQuitConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-gray-900 mb-2">Quit this session?</h3>
            <p className="text-gray-500 text-sm mb-6">Your progress will be saved and you can see your results.</p>
            <div className="flex gap-3">
              <button onClick={handleQuit} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600">
                Yes, quit
              </button>
              <button onClick={() => setShowQuitConfirm(false)} className="flex-1 border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50">
                Keep playing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
