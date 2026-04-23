import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminGetSubmissions, adminReviewSubmission, adminClearFeaturedSubmission, adminQueueSubmission } from '../../lib/api'

type Submission = {
  id: string
  user_id: string
  username: string
  prompt: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string | null
  status: string
  featured_date: string | null
  created_at: string
}

const STATUS_FILTERS = ['pending', 'approved', 'featured', 'rejected']

export default function AdminSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [filter])

  async function load() {
    setLoading(true)
    try {
      const data = await adminGetSubmissions(filter)
      setSubmissions(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleReview(id: string, status: string, date?: string) {
    setProcessing(id)
    try {
      await adminReviewSubmission(id, status, date)
      await load()
      setExpanded(null)
    } catch (err: any) {
      alert(err?.message ?? 'Error updating submission')
    } finally {
      setProcessing(null)
    }
  }

  async function handleQueue(id: string) {
    setProcessing(id)
    setQueuedMsg(null)
    try {
      const date = await adminQueueSubmission(id)
      const friendly = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      setQueuedMsg(`✓ Queued for ${friendly}`)
      await load()
      setExpanded(null)
    } catch (err: any) {
      alert(err?.message ?? 'Error queueing submission')
    } finally {
      setProcessing(null)
    }
  }

  const statusBadge = (s: string) => {
    const cls =
      s === 'pending' ? 'bg-amber-500/100/15 text-amber-400' :
      s === 'approved' ? 'bg-blue-500/100/15 text-blue-400' :
      s === 'featured' ? 'bg-green-500/100/15 text-green-400' :
      'bg-gray-100 text-gray-400'
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{s}</span>
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 mb-6">
          ← Admin
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">Question Submissions</h1>
        <p className="text-gray-400 mb-4">Review and approve community-submitted trivia questions. Use <strong className="font-semibold text-gray-200">Add to Queue</strong> to schedule an approved question as the next available daily community question.</p>

        {queuedMsg && (
          <div className="mb-6 bg-green-500/10 border border-green-500/30 text-green-800 text-sm font-medium px-4 py-3 rounded-xl flex items-center justify-between">
            {queuedMsg}
            <button onClick={() => setQueuedMsg(null)} className="text-green-500 hover:text-green-400 text-lg leading-none ml-4">×</button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex border-b border-white/10 mb-6">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                filter === s ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-16 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-400">No {filter} submissions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => {
              const isOpen = expanded === s.id
              const opts = [
                { label: 'A', text: s.option_a },
                { label: 'B', text: s.option_b },
                { label: 'C', text: s.option_c },
                { label: 'D', text: s.option_d },
              ]
              return (
                <div key={s.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  {/* Summary row */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.prompt}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        by @{s.username} · {new Date(s.created_at).toLocaleDateString()}
                        {s.featured_date && ` · Featured: ${s.featured_date}`}
                      </p>
                    </div>
                    {statusBadge(s.status)}
                    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-white/10 px-5 pb-5 pt-4">
                      <p className="text-sm font-semibold text-white mb-4">{s.prompt}</p>

                      {/* Options */}
                      <div className="space-y-2 mb-4">
                        {opts.map((o) => {
                          const isCorrect = o.label.toLowerCase() === s.correct_option
                          return (
                            <div key={o.label} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                              isCorrect ? 'border-green-400 bg-green-500/10 text-green-800' : 'border-white/10 text-gray-300'
                            }`}>
                              <span className="font-bold w-4">{o.label}</span>
                              <span className="flex-1">{o.text}</span>
                              {isCorrect && <span className="text-xs font-semibold text-green-400">✓ Correct</span>}
                            </div>
                          )
                        })}
                      </div>

                      {s.explanation && (
                        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mb-4">
                          💡 {s.explanation}
                        </p>
                      )}

                      {/* Admin actions */}
                      <div className="flex flex-wrap gap-2 items-center">
                        {s.status !== 'approved' && s.status !== 'featured' && (
                          <button
                            onClick={() => handleReview(s.id, 'approved')}
                            disabled={processing === s.id}
                            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}

                        {s.status !== 'featured' && (
                          <button
                            onClick={() => handleQueue(s.id)}
                            disabled={processing === s.id}
                            className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {processing === s.id ? 'Queuing…' : '📅 Add to Queue'}
                          </button>
                        )}

                        {s.status === 'featured' && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Remove this question from the daily for ${s.featured_date}? It will go back to "approved" status and the daily slot will be empty.`)) return
                              setProcessing(s.id)
                              try {
                                await adminClearFeaturedSubmission(s.id)
                                await load()
                                setExpanded(null)
                              } catch (err: any) {
                                alert(err?.message ?? 'Error removing from daily')
                              } finally {
                                setProcessing(null)
                              }
                            }}
                            disabled={processing === s.id}
                            className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            🗑 Remove from Daily
                          </button>
                        )}

                        {s.status !== 'rejected' && s.status !== 'featured' && (
                          <button
                            onClick={() => { if (confirm('Reject this submission?')) handleReview(s.id, 'rejected') }}
                            disabled={processing === s.id}
                            className="text-sm border border-red-500/30 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
