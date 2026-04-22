import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { submitQuestion, getCategories } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { Category } from '../types'

type CorrectOption = 'a' | 'b' | 'c' | 'd'

const OPTION_LABELS: { key: CorrectOption; label: string }[] = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
  { key: 'd', label: 'D' },
]

export default function SubmitQuestionPage() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()

  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [options, setOptions] = useState({ a: '', b: '', c: '', d: '' })
  const [correct, setCorrect] = useState<CorrectOption | null>(null)
  const [explanation, setExplanation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ score: number; matched: string } | null>(null)

  const SIMILARITY_THRESHOLD = 0.85

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  function setOption(key: CorrectOption, val: string) {
    setOptions((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!categoryId) { setError('Select a category.'); return }
    if (!prompt.trim()) { setError('Write your question.'); return }
    if (Object.values(options).some((o) => !o.trim())) { setError('Fill in all four answer options.'); return }
    if (!correct) { setError('Select the correct answer.'); return }
    setError(null)
    setDuplicateWarning(null)
    setSubmitting(true)

    try {
      // Check similarity against vault before submitting
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
    } catch {
      // Similarity check failed — don't block submission, just proceed
    }

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
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return (
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
          <button
            onClick={() => { setDone(false); setCategoryId(''); setPrompt(''); setOptions({ a:'',b:'',c:'',d:'' }); setCorrect(null); setExplanation('') }}
            className="border border-amber-500 text-amber-400 font-semibold px-5 py-2.5 rounded-xl hover:bg-amber-500/10"
          >
            Submit another
          </button>
          <button
            onClick={() => navigate('/play')}
            className="bg-amber-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-amber-600"
          >
            Play today's round
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Submit a Question</h1>
          <p className="text-gray-400">
            Think you've got a great trivia question? Submit it — if it gets picked as the daily
            community question, you'll be featured on the home page.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Category */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Category <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-3">Pick the category your question best fits into.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors ${
                    categoryId === cat.id
                      ? 'border-indigo-500 bg-amber-500/10 text-amber-400'
                      : 'border-white/10 text-gray-300 hover:border-amber-500/40 hover:bg-white/5'
                  }`}
                >
                  {categoryId === cat.id && <span className="mr-1">✓</span>}
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Question */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Your question <span className="text-red-500">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setDuplicateWarning(null) }}
              placeholder="What is the capital of Australia?"
              rows={3}
              maxLength={300}
              className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{prompt.length}/300</p>
          </div>

          {/* Options */}
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
                  correct === key ? 'border-green-400 bg-green-50' : 'border-white/10'
                }`}>
                  <button
                    type="button"
                    onClick={() => setCorrect(key)}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      correct === key
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 hover:border-amber-400'
                    }`}
                    title="Mark as correct"
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
                    onChange={(e) => setOption(key, e.target.value)}
                    placeholder={`Option ${label}`}
                    maxLength={150}
                    className="flex-1 text-sm bg-transparent focus:outline-none placeholder-gray-300"
                  />
                </div>
              ))}
            </div>

            {correct && (
              <p className="text-xs text-green-600 mt-3">
                ✓ Option {correct.toUpperCase()} marked as the correct answer
              </p>
            )}
          </div>

          {/* Explanation (optional) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <label className="block text-sm font-semibold text-gray-200 mb-1">
              Explanation <span className="text-gray-400 font-normal">(optional but appreciated)</span>
            </label>
            <p className="text-xs text-gray-400 mb-3">A quick note on why the answer is correct. Helps players learn.</p>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Canberra, not Sydney, is Australia's capital — a deliberate compromise between the two rival cities."
              rows={2}
              maxLength={300}
              className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {duplicateWarning && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">🚫</span>
                <div>
                  <p className="font-semibold text-amber-800 text-sm mb-1">
                    That question already exists in the vault ({duplicateWarning.score}% match)
                  </p>
                  <p className="text-amber-700 text-xs leading-relaxed">
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
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
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

      </div>
    </div>
  )
}
