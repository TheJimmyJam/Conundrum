import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getNextEndlessQuestion, submitEndlessAnswer, endEndlessSession } from '../lib/api'
import { useGameStore } from '../store/gameStore'
import type { QuestionWithOptions } from '../types'

type Phase = 'loading' | 'question' | 'feedback' | 'done' | 'quitting' | 'error' | 'afk'

export default function EndlessPlayPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionId = (location.state as any)?.sessionId as string

  const { runningScore, streakCount, updateRunningScore, reset } = useGameStore()

  const [phase, setPhase] = useState<Phase>('loading')
  const [question, setQuestion] = useState<QuestionWithOptions | null>(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [timer, setTimer] = useState(30)
  const [nextTimer, setNextTimer] = useState(0)
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0)
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
    setFeedback(null)
    setNextTimer(0)
    try {
      const result = await getNextEndlessQuestion(sessionId)
      if (result.done) {
        await finishSession()
      } else {
        setQuestion(result.question!)
        setQuestionCount((c) => c + 1)
        setTimer(30)
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

  // Question countdown timer
  useEffect(() => {
    if (phase !== 'question') return
    const interval = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) { handleAnswer(null); return 30 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, question])

  // Next-question countdown timer (runs during feedback phase)
  useEffect(() => {
    if (phase !== 'feedback' || nextTimer <= 0) return
    const timeout = setTimeout(() => {
      setNextTimer((n) => {
        if (n <= 1) {
          loadNextQuestion()
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => clearTimeout(timeout)
  }, [phase, nextTimer])

  function handleNext() {
    setNextTimer(0)
    loadNextQuestion()
  }

  async function handleAnswer(optionId: string | null) {
    if (!question || phase !== 'question') return

    // AFK detection — 5 consecutive timeouts ends the session
    if (optionId === null) {
      const newCount = consecutiveTimeouts + 1
      setConsecutiveTimeouts(newCount)
      if (newCount >= 5) {
        setPhase('afk')
        setTimeout(() => finishSession(), 3000)
        return
      }
    } else {
      setConsecutiveTimeouts(0)
    }

    setPhase('feedback')
    setPendingOptionId(optionId)

    const responseTimeMs = Math.max(0, (30 - timer) * 1000)
    const result = await submitEndlessAnswer({
      session_id: sessionId,
      question_id: question.id,
      selected_option_id: optionId ?? '',
      response_time_ms: responseTimeMs,
    })

    setPendingOptionId(null)
    setFeedback({
      isCorrect: result.is_correct,
      correctOptionId: result.correct_option_id,
      selectedOptionId: optionId ?? '',
      pointsAwarded: result.points_awarded,
      explanation: result.explanation,
    })
    updateRunningScore(result.points_awarded, result.is_correct)
    setNextTimer(10)
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
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2">Couldn't load a question</h2>
        <p className="text-gray-400 text-sm mb-6">Something went wrong fetching your next question. Try again.</p>
        <button
          onClick={() => loadNextQuestion()}
          className="bg-amber-500 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-amber-600"
        >
          Try again
        </button>
      </div>
    </div>
  )

  if (phase === 'loading' || phase === 'done') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent" />
    </div>
  )

  if (phase === 'quitting') return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Saving your progress…</p>
    </div>
  )

  if (phase === 'afk') return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">💤</div>
        <h2 className="text-xl font-bold text-white mb-2">You fell asleep?</h2>
        <p className="text-gray-400 text-sm">No answers for 5 questions in a row — wrapping up your session.</p>
      </div>
    </div>
  )

  const timerPct = (timer / 30) * 100
  const timerColor = timer > 15 ? 'bg-green-500' : timer > 8 ? 'bg-yellow-500' : 'bg-red-500'
  const nextPct = (nextTimer / 10) * 100

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col">
      {/* Header */}
      <div className="bg-[#0f0f1a] border-b border-white/10 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <div className="flex gap-4 text-sm">
          <span className="font-semibold text-gray-200">Q {questionCount}</span>
          {streakCount >= 2 && <span className="text-orange-500 font-medium">🔥 {streakCount} streak</span>}
        </div>
        <span className="font-bold text-amber-400">{runningScore} pts</span>
        <div className="flex items-center gap-3">
          {phase === 'question' && (
            <span className={`text-lg font-bold ${timer <= 8 ? 'text-red-400' : 'text-gray-200'}`}>{timer}s</span>
          )}
          <button
            onClick={() => setShowQuitConfirm(true)}
            className="text-sm font-semibold text-red-400 hover:text-white hover:bg-red-500 border border-red-500/40 hover:border-red-500 px-4 py-1.5 rounded-lg transition-colors"
          >
            End
          </button>
        </div>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 bg-white/10 max-w-5xl mx-auto w-full">
        {phase === 'question' && (
          <div className={`h-full ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
        )}
        {phase === 'feedback' && (
          <div className="h-full bg-amber-500/40 transition-all duration-1000" style={{ width: `${nextPct}%` }} />
        )}
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {question && (
          <>
            {/* Category + difficulty badges */}
            <div className="flex items-center gap-2 mb-5">
              {question.category_name && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400">
                  {question.category_name}
                </span>
              )}
              {question.difficulty && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  question.difficulty === 'easy'   ? 'bg-green-500/15 text-green-400' :
                  question.difficulty === 'medium' ? 'bg-yellow-500/15 text-yellow-400' :
                                                     'bg-red-500/15 text-red-400'
                }`}>
                  {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
                </span>
              )}
            </div>

            {/* Desktop: question left, answers right. Mobile: stacked */}
            <div className="md:flex md:gap-10 md:items-start">

              {/* Question */}
              <div className="md:flex-1 mb-6 md:mb-0">
                <h2 className="text-2xl font-bold text-white leading-snug">{question.prompt}</h2>
              </div>

              {/* Answer grid — 1 col mobile, 2×2 desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:w-[420px] md:shrink-0">
                {question.options
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((opt) => {
                    let style = 'border border-white/10 bg-white/5 hover:border-amber-400 hover:bg-amber-500/10'

                    if (feedback) {
                      if (opt.id === feedback.correctOptionId) style = 'border-2 border-green-500 bg-green-500/10'
                      else if (opt.id === feedback.selectedOptionId && !feedback.isCorrect) style = 'border-2 border-red-400 bg-red-500/10'
                      else style = 'border border-white/10 bg-white/5 opacity-40'
                    } else if (pendingOptionId !== null) {
                      if (opt.id === pendingOptionId) style = 'border-2 border-amber-500 bg-amber-500/10'
                      else style = 'border border-white/10 bg-white/5 opacity-40'
                    }

                    return (
                      <button
                        key={opt.id}
                        onClick={() => phase === 'question' && handleAnswer(opt.id)}
                        disabled={phase !== 'question'}
                        className={`w-full text-left px-4 py-4 md:min-h-[90px] md:flex md:items-center rounded-xl transition-colors font-medium text-gray-100 text-sm md:text-base ${style}`}
                      >
                        {opt.option_text}
                      </button>
                    )
                  })}
              </div>
            </div>

            {/* Feedback panel — full width below the question+answer row */}
            {feedback && (
              <div className="mt-8 space-y-4">
                <div className={`flex items-center gap-2 text-sm font-semibold ${feedback.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                  {feedback.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                  {feedback.pointsAwarded > 0 && (
                    <span className="text-amber-400 font-bold">+{feedback.pointsAwarded} pts</span>
                  )}
                </div>

                {feedback.explanation && (
                  <p className="text-sm text-gray-300 leading-relaxed">{feedback.explanation}</p>
                )}

                <button
                  onClick={handleNext}
                  className="w-full flex items-center justify-between bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/40 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
                >
                  <span>Next question</span>
                  <span className="flex items-center gap-2 text-gray-400">
                    <span className="text-sm tabular-nums">{nextTimer}s</span>
                    <span className="text-amber-400">›</span>
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quit confirm */}
      {showQuitConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div className="bg-white/5 rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-white mb-2">End this session?</h3>
            <p className="text-gray-400 text-sm mb-6">Your progress will be saved and you'll see your results.</p>
            <div className="flex gap-3">
              <button onClick={handleQuit} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600">
                End session
              </button>
              <button onClick={() => setShowQuitConfirm(false)} className="flex-1 border border-white/10 text-gray-200 font-semibold py-2.5 rounded-lg hover:bg-white/5">
                Keep playing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
