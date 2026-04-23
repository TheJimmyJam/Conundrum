import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { submitQuestion, submitDailySet, getCategories } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { Category } from '../types'

type Mode = 'question' | 'set'
type CorrectOption = 'a' | 'b' | 'c' | 'd'

// ─── Single-question types ────────────────────────────────────────────────────

const OPTION_LABELS: { key: CorrectOption; label: string }[] = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
  { key: 'd', label: 'D' },
]

const SIMILARITY_THRESHOLD = 0.85

// ─── Daily-set types ──────────────────────────────────────────────────────────

type QuestionDraft = {
  prompt: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: CorrectOption | null
  explanation: string
  category_id: string
}

const BLANK_QUESTION = (): QuestionDraft => ({
  prompt: '', option_a: '', option_b: '', option_c: '', option_d: '',
  correct_option: null, explanation: '', category_id: '',
})

const OPTION_KEYS: CorrectOption[] = ['a', 'b', 'c', 'd']

function isComplete(q: QuestionDraft): boolean {
  return !!(
    q.prompt.trim() &&
    q.option_a.trim() && q.option_b.trim() &&
    q.option_c.trim() && q.option_d.trim() &&
    q.correct_option
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SubmitPage() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('question')
  const [categories, setCategories] = useState<Category[]>([])

  // ── Single-question state ──
  const [categoryId, setCategoryId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [options, setOptions] = useState({ a: '', b: '', c: '', d: '' })
  const [correct, setCorrect] = useState<CorrectOption | null>(null)
  const [explanation, setExplanation] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<{ score: number; matched: string } | null>(null)
  const [qDone, setQDone] = useState(false)

  // ── Daily-set state ──
  const [title, setTitle] = useState('')
  const [step, setStep] = useState(0)
  const [questions, setQuestions] = useState<QuestionDraft[]>(Array.from({ length: 10 }, BLANK_QUESTION))
  const [setDone, setSetDone] = useState(false)

  // ── Shared ──
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  // ── Reset error when switching modes ──
  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
  }

  // ─── Single-question logic ─────────────────────────────────────────────────

  function setOption(key: CorrectOption, val: string) {
    setOptions(prev => ({ ...prev, [key]: val }))
  }

  async function handleQuestionSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!categoryId) { setError('Select a category.'); return }
    if (!prompt.trim()) { setError('Write your question.'); return }
    if (Object.values(options).some(o => !o.trim())) { setError('Fill in all four answer options.'); return }
    if (!correct) { setError('Select the correct answer.'); return }
    setError(null)
    setDuplicateWarning(null)
    setSubmitting(true)
    try {
      const { data: simResult, error: simError } = await supabase
        .rpc('check_question_similarity', { p_prompt: prompt.trim() })
      if (!simError && simResult && simResult.length > 0) {
        const { similarity_score, matched_prompt } = simResult[0]
        if (similarity_score >= SIMILARITY_THRESHOLD) {
          setDuplicateWarning({ score: Math.round(similarity_score * 100), matched: matched_prompt })
          setSubmitting(false)
          return
        }
      }
    } catch { /* similarity check failure is non-blocking */ }
    try {
      await submitQuestion({
        prompt: prompt.trim(),
        option_a: options.a.trim(),
        option_b: options.b.trim(),
        option_c: options.c.trim(),
        option_d: options.d.trim(),
        correct_option: correct,
        explanation: explanation.trim() || null,
        category_id: categoryId || null,
      })
      setQDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetQuestion() {
    setQDone(false); setCategoryId(''); setPrompt('')
    setOptions({ a: '', b: '', c: '', d: '' }); setCorrect(null); setExplanation('')
  }

  // ─── Daily-set logic ───────────────────────────────────────────────────────

  function updateQuestion(index: number, field: keyof QuestionDraft, value: string) {
    setQuestions(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function setSetCorrect(index: number, opt: CorrectOption) {
    updateQuestion(index, 'correct_option', opt)
  }

  const allComplete = title.trim().length >= 3 && questions.every(isComplete)
  const completedCount = questions.filter(isComplete).length

  async function handleSetSubmit() {
    setError(null)
    if (!title.trim() || title.trim().length < 3) {
      setError('Give your set a title (at least 3 characters).')
      return
    }
    if (!allComplete) {
      const first = questions.findIndex(q => !isComplete(q))
      setError(`Question ${first + 1} is incomplete. Fill in all required fields.`)
      setStep(first)
      return
    }
    setSubmitting(true)
    try {
      await submitDailySet(
        title.trim(),
        questions.map(q => ({
          prompt: q.prompt.trim(),
          option_a: q.option_a.trim(),
          option_b: q.option_b.trim(),
          option_c: q.option_c.trim(),
          option_d: q.option_d.trim(),
          correct_option: q.correct_option!,
          explanation: q.explanation.trim() || null,
          category_id: q.category_id || null,
        }))
      )
      setSetDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetSet() {
    setSetDone(false); setTitle(''); setStep(0)
    setQuestions(Array.from({ length: 10 }, BLANK_QUESTION))
  }

  // ─── Done screens ──────────────────────────────────────────────────────────

  if (qDone) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-5">🎉</div>
        <h1 className="text-3xl font-bold text-white mb-3">Question submitted!</h1>
        <p className="text-gray-400 mb-2">
          Thanks, <span className="font-semibold text-amber-400">@{profile?.username}</span>!
        </p>
        <p className="text-gray-400 text-sm mb-8">
          Our team reviews every submission. If yours is selected as the daily community pick,
          you'll be featured on the Cnndrm home page. 🏆
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={resetQuestion} className="border border-amber-500 text-amber-400 font-semibold px-5 py-2.5 rounded-xl hover:bg-amber-500/10">
            Submit another
          </button>
          <button onClick={() => navigate('/play')} className="bg-amber-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-amber-600">
            Play today's round
          </button>
        </div>
      </div>
    </div>
  )

  if (setDone) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-5">🎉</div>
        <h1 className="text-3xl font-bold text-white mb-3">Set submitted!</h1>
        <p className="text-gray-400 mb-2">
          Thanks, <span className="font-semibold text-amber-400">@{profile?.username}</span>!
        </p>
        <p className="text-gray-400 text-sm mb-8">
          Our team reviews every submission. If your set gets selected, it could become a
          future daily round — and you'll be credited. 🏆
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={resetSet} className="border border-amber-500 text-amber-400 font-semibold px-5 py-2.5 rounded-xl hover:bg-amber-500/10">
            Submit another
          </button>
          <button onClick={() => navigate('/play')} className="bg-amber-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-amber-600">
            Play today's round
          </button>
        </div>
      </div>
    </div>
  )

  // ─── Main render ───────────────────────────────────────────────────────────

  const q = questions[step]

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Submit</h1>
          <p className="text-gray-400 text-sm">Help grow the Cnndrm vault. Choose what you'd like to submit.</p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => switchMode('question')}
            className={`flex-1 py-4 rounded-2xl border text-sm font-semibold transition-all ${
              mode === 'question'
                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                : 'border-white/10 bg-white/5 text-gray-400 hover:border-amber-500/30 hover:text-gray-200'
            }`}
          >
            <div className="text-2xl mb-1">💡</div>
            Community Question
            <div className="text-xs font-normal text-gray-500 mt-0.5">1 question</div>
          </button>
          <button
            onClick={() => switchMode('set')}
            className={`flex-1 py-4 rounded-2xl border text-sm font-semibold transition-all ${
              mode === 'set'
                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                : 'border-white/10 bg-white/5 text-gray-400 hover:border-amber-500/30 hover:text-gray-200'
            }`}
          >
            <div className="text-2xl mb-1">📋</div>
            Daily Set
            <div className="text-xs font-normal text-gray-500 mt-0.5">10 questions</div>
          </button>
        </div>

        {/* ── Community Question Form ── */}
        {mode === 'question' && (
          <form onSubmit={handleQuestionSubmit} className="space-y-6">

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-3">Pick the category your question best fits into.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors ${
                      categoryId === cat.id
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-white/10 text-gray-300 hover:border-amber-500/40 hover:bg-white/5'
                    }`}
                  >
                    {categoryId === cat.id && <span className="mr-1">✓</span>}
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                Your question <span className="text-red-500">*</span>
              </label>
              <textarea
                value={prompt}
                onChange={e => { setPrompt(e.target.value); setDuplicateWarning(null) }}
                placeholder="What is the capital of Australia?"
                rows={3}
                maxLength={300}
                className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none placeholder-gray-500"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{prompt.length}/300</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-semibold text-gray-200">
                  Answer options <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-gray-400">Click the circle to mark the correct answer</span>
              </div>
              <div className="space-y-3">
                {OPTION_LABELS.map(({ key, label }) => (
                  <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    correct === key ? 'border-green-400 bg-green-500/10' : 'border-white/10'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setCorrect(key)}
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        correct === key
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-white/30 hover:border-amber-400'
                      }`}
                    >
                      {correct === key ? (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">{label}</span>
                      )}
                    </button>
                    <input
                      type="text"
                      value={options[key]}
                      onChange={e => setOption(key, e.target.value)}
                      placeholder={`Option ${label}`}
                      maxLength={150}
                      className="flex-1 text-sm text-white bg-transparent focus:outline-none placeholder-gray-500"
                    />
                  </div>
                ))}
              </div>
              {correct && (
                <p className="text-xs text-green-400 mt-3">
                  ✓ Option {correct.toUpperCase()} marked as the correct answer
                </p>
              )}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <label className="block text-sm font-semibold text-gray-200 mb-1">
                Explanation <span className="text-gray-400 font-normal">(optional but appreciated)</span>
              </label>
              <p className="text-xs text-gray-400 mb-3">A quick note on why the answer is correct. Helps players learn.</p>
              <textarea
                value={explanation}
                onChange={e => setExplanation(e.target.value)}
                placeholder="Canberra, not Sydney, is Australia's capital — a deliberate compromise between the two rival cities."
                rows={2}
                maxLength={300}
                className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none placeholder-gray-500"
              />
            </div>

            {duplicateWarning && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">🚫</span>
                  <div>
                    <p className="font-semibold text-amber-400 text-sm mb-1">
                      That question already exists in the vault ({duplicateWarning.score}% match)
                    </p>
                    <p className="text-amber-300/70 text-xs leading-relaxed">
                      We found something very similar already in our collection. Try a different angle — unique questions have the best shot at being featured!
                    </p>
                    <p className="text-amber-500 text-xs mt-2 italic line-clamp-2">
                      Similar: "{duplicateWarning.matched}"
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-amber-500 text-white font-semibold py-3.5 rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Question'}
            </button>

            <p className="text-center text-xs text-gray-400">
              All submissions are reviewed before use. By submitting you agree your question may appear in Cnndrm.
            </p>
          </form>
        )}

        {/* ── Daily Set Form ── */}
        {mode === 'set' && (
          <div>

            {/* Set title */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
              <label className="block text-sm font-semibold text-gray-200 mb-2">
                Set title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder='e.g. "80s Music Trivia" or "Science & Tech Throwdown"'
                maxLength={80}
                className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-500"
              />
            </div>

            {/* Question tabs */}
            <div className="flex gap-1.5 mb-6 flex-wrap">
              {questions.map((qd, i) => {
                const done = isComplete(qd)
                const active = i === step
                return (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`w-9 h-9 rounded-lg text-xs font-bold transition-all border ${
                      active
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : done
                        ? 'bg-green-500/20 border-green-500/40 text-green-400'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-amber-500/30 hover:text-amber-400'
                    }`}
                    title={`Question ${i + 1}${done ? ' ✓' : ''}`}
                  >
                    {done && !active ? '✓' : i + 1}
                  </button>
                )
              })}
              <span className="ml-auto text-xs text-gray-500 self-center">
                {completedCount}/10 complete
              </span>
            </div>

            {/* Current question */}
            <div className="space-y-5">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Question {step + 1} of 10
              </p>

              {/* Category */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <label className="block text-sm font-semibold text-gray-200 mb-3">
                  Category <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => updateQuestion(step, 'category_id', q.category_id === cat.id ? '' : cat.id)}
                      className={`px-3 py-2 rounded-xl border text-sm font-medium text-left transition-colors ${
                        q.category_id === cat.id
                          ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                          : 'border-white/10 text-gray-300 hover:border-amber-500/30 hover:bg-white/5'
                      }`}
                    >
                      {q.category_id === cat.id && <span className="mr-1">✓</span>}
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question prompt */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <label className="block text-sm font-semibold text-gray-200 mb-2">
                  Question <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={q.prompt}
                  onChange={e => updateQuestion(step, 'prompt', e.target.value)}
                  placeholder="What is the capital of Australia?"
                  rows={3}
                  maxLength={300}
                  className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none placeholder-gray-500"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{q.prompt.length}/300</p>
              </div>

              {/* Answer options */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-semibold text-gray-200">
                    Answer options <span className="text-red-400">*</span>
                  </label>
                  <span className="text-xs text-gray-400">Click the circle to mark correct</span>
                </div>
                <div className="space-y-3">
                  {OPTION_KEYS.map(key => {
                    const isCorrect = q.correct_option === key
                    const val = q[`option_${key}` as keyof QuestionDraft] as string
                    return (
                      <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                        isCorrect ? 'border-green-400 bg-green-500/10' : 'border-white/10'
                      }`}>
                        <button
                          type="button"
                          onClick={() => setSetCorrect(step, key)}
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isCorrect
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-white/30 hover:border-amber-400'
                          }`}
                        >
                          {isCorrect ? (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <span className="text-xs text-gray-400 font-bold">{key.toUpperCase()}</span>
                          )}
                        </button>
                        <input
                          type="text"
                          value={val}
                          onChange={e => updateQuestion(step, `option_${key}` as keyof QuestionDraft, e.target.value)}
                          placeholder={`Option ${key.toUpperCase()}`}
                          maxLength={150}
                          className="flex-1 text-sm text-white bg-transparent focus:outline-none placeholder-gray-500"
                        />
                      </div>
                    )
                  })}
                </div>
                {q.correct_option && (
                  <p className="text-xs text-green-400 mt-3">
                    ✓ Option {q.correct_option.toUpperCase()} marked as correct
                  </p>
                )}
              </div>

              {/* Explanation */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <label className="block text-sm font-semibold text-gray-200 mb-1">
                  Explanation <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <p className="text-xs text-gray-400 mb-3">A quick note on why the answer is correct. Players love these.</p>
                <textarea
                  value={q.explanation}
                  onChange={e => updateQuestion(step, 'explanation', e.target.value)}
                  placeholder="Canberra, not Sydney, is Australia's capital — a deliberate compromise between the two rival cities."
                  rows={2}
                  maxLength={300}
                  className="w-full bg-white/5 text-white border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none placeholder-gray-500"
                />
              </div>
            </div>

            {error && (
              <div className="mt-5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {/* Prev / Next / Submit */}
            <div className="flex items-center justify-between mt-6 gap-3">
              <button
                type="button"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              {step < 9 ? (
                <button
                  type="button"
                  onClick={() => setStep(s => Math.min(9, s + 1))}
                  className="flex-1 bg-white/10 text-white font-semibold py-2.5 rounded-xl hover:bg-white/15 transition-colors text-sm"
                >
                  Next Question →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSetSubmit}
                  disabled={submitting || !allComplete}
                  className="flex-1 bg-amber-500 text-white font-semibold py-2.5 rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-colors text-sm"
                >
                  {submitting ? 'Submitting…' : 'Submit All 10 Questions'}
                </button>
              )}
            </div>

            {step === 9 && !allComplete && (
              <p className="text-center text-xs text-gray-500 mt-3">
                Complete all 10 questions to submit. {10 - completedCount} still need attention.
              </p>
            )}

            <p className="text-center text-xs text-gray-500 mt-4">
              All submissions are reviewed before use. By submitting you agree your questions may appear in Cnndrm.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
