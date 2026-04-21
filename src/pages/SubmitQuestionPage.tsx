import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { submitQuestion } from '../lib/api'

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

  const [prompt, setPrompt] = useState('')
  const [options, setOptions] = useState({ a: '', b: '', c: '', d: '' })
  const [correct, setCorrect] = useState<CorrectOption | null>(null)
  const [explanation, setExplanation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setOption(key: CorrectOption, val: string) {
    setOptions((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!correct) { setError('Select the correct answer.'); return }
    if (!prompt.trim()) { setError('Write your question.'); return }
    if (Object.values(options).some((o) => !o.trim())) { setError('Fill in all four answer options.'); return }
    setError(null)
    setSubmitting(true)
    try {
      await submitQuestion({
        prompt: prompt.trim(),
        option_a: options.a.trim(),
        option_b: options.b.trim(),
        option_c: options.c.trim(),
        option_d: options.d.trim(),
        correct_option: correct,
        explanation: explanation.trim() || null,
      })
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-5">🎉</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Question submitted!</h1>
        <p className="text-gray-500 mb-2">
          Thanks, <span className="font-semibold text-indigo-600">@{profile?.username}</span>!
        </p>
        <p className="text-gray-400 text-sm mb-8">
          Our team reviews every submission. If yours is selected as the daily community pick,
          you'll be featured on the Cnndrm home page. 🏆
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setDone(false); setPrompt(''); setOptions({ a:'',b:'',c:'',d:'' }); setCorrect(null); setExplanation('') }}
            className="border border-indigo-600 text-indigo-600 font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-50"
          >
            Submit another
          </button>
          <button
            onClick={() => navigate('/play')}
            className="bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700"
          >
            Play today's round
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Submit a Question</h1>
          <p className="text-gray-500">
            Think you've got a great trivia question? Submit it — if it gets picked as the daily
            community question, you'll be featured on the home page.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Question */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Your question <span className="text-red-500">*</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What is the capital of Australia?"
              rows={3}
              maxLength={300}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{prompt.length}/300</p>
          </div>

          {/* Options */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-semibold text-gray-700">
                Answer options <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-gray-400">Click the circle to mark the correct answer</span>
            </div>

            <div className="space-y-3">
              {OPTION_LABELS.map(({ key, label }) => (
                <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  correct === key ? 'border-green-400 bg-green-50' : 'border-gray-200'
                }`}>
                  <button
                    type="button"
                    onClick={() => setCorrect(key)}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      correct === key
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 hover:border-indigo-400'
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
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Explanation <span className="text-gray-400 font-normal">(optional but appreciated)</span>
            </label>
            <p className="text-xs text-gray-400 mb-3">A quick note on why the answer is correct. Helps players learn.</p>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Canberra, not Sydney, is Australia's capital — a deliberate compromise between the two rival cities."
              rows={2}
              maxLength={300}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
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
