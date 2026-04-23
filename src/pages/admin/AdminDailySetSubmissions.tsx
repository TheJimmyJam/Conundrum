import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  adminGetDailySetSubmissions,
  adminGetDailySetSubmissionQuestions,
  adminReviewDailySetSubmission,
  adminCreateSetFromSubmission,
  type AdminDailySetSubmission,
  type AdminDailySetSubmissionQuestion,
} from '../../lib/api'

const STATUS_FILTERS = ['pending', 'approved', 'rejected']

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-500/15 text-amber-400',
  approved: 'bg-green-500/15 text-green-400',
  rejected: 'bg-red-500/15 text-red-400',
}

export default function AdminDailySetSubmissions() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('pending')
  const [submissions, setSubmissions] = useState<AdminDailySetSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Record<string, AdminDailySetSubmissionQuestion[]>>({})
  const [processing, setProcessing] = useState<string | null>(null)
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [notes, setNotes] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    setExpanded(null)
    try {
      const data = await adminGetDailySetSubmissions(filter)
      setSubmissions(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!questions[id]) {
      try {
        const qs = await adminGetDailySetSubmissionQuestions(id)
        setQuestions(prev => ({ ...prev, [id]: qs }))
      } catch (err) {
        console.error(err)
      }
    }
  }

  async function handleApprove(id: string) {
    if (!confirm('Approve this set? This will add all 10 questions to the vault.')) return
    setProcessing(id)
    try {
      await adminReviewDailySetSubmission(id, 'approved')
      setSuccessMsg('Set approved — 10 questions added to the vault. Use "Create Draft" to schedule it.')
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Error approving submission')
    } finally {
      setProcessing(null)
    }
  }

  async function handleReject(id: string) {
    setProcessing(id)
    try {
      await adminReviewDailySetSubmission(id, 'rejected', notes)
      setRejectId(null)
      setNotes('')
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Error rejecting submission')
    } finally {
      setProcessing(null)
    }
  }

  async function handleSchedule(id: string) {
    if (!scheduleDate) { alert('Pick a date first.'); return }
    setScheduling(true)
    try {
      await adminCreateSetFromSubmission(id, scheduleDate)
      setScheduleId(null)
      setScheduleDate('')
      setSuccessMsg(`Draft daily set created for ${scheduleDate}.`)
      navigate(`/admin/daily-set`)
    } catch (err: any) {
      alert(err?.message ?? 'Error creating daily set')
    } finally {
      setScheduling(false)
    }
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 mb-6">
          ← Admin
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">Daily Set Submissions</h1>
        <p className="text-gray-400 mb-6">
          Review community-submitted 10-question sets. Approved sets have their questions added
          to the vault and can be scheduled as a future daily round.
        </p>

        {successMsg && (
          <div className="mb-6 bg-green-500/10 border border-green-500/30 text-green-300 text-sm font-medium px-4 py-3 rounded-xl flex items-center justify-between">
            {successMsg}
            <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-300 text-lg ml-4">×</button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex border-b border-white/10 mb-6">
          {STATUS_FILTERS.map(s => (
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
            <p className="text-gray-400">No {filter} set submissions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map(sub => {
              const isOpen = expanded === sub.id
              const qs = questions[sub.id] ?? []

              return (
                <div key={sub.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  {/* Summary row */}
                  <button
                    onClick={() => toggleExpand(sub.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">"{sub.title}"</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        by @{sub.username} · {new Date(sub.created_at).toLocaleDateString()}
                        {' · '}{sub.question_count}/10 questions
                      </p>
                      {sub.admin_notes && (
                        <p className="text-xs text-gray-500 mt-0.5 italic">Note: {sub.admin_notes}</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[sub.status] ?? 'bg-gray-100 text-gray-400'}`}>
                      {sub.status}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded */}
                  {isOpen && (
                    <div className="border-t border-white/10 px-5 pb-5 pt-4">

                      {qs.length === 0 ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-4 border-amber-500 border-t-transparent" />
                        </div>
                      ) : (
                        <div className="space-y-4 mb-5">
                          {qs.map((q, i) => {
                            const opts = [
                              { label: 'A', text: q.option_a, key: 'a' },
                              { label: 'B', text: q.option_b, key: 'b' },
                              { label: 'C', text: q.option_c, key: 'c' },
                              { label: 'D', text: q.option_d, key: 'd' },
                            ]
                            return (
                              <div key={q.id} className="bg-white/3 border border-white/8 rounded-xl p-4">
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                                    Q{i + 1}{q.category_name ? ` · ${q.category_name}` : ''}
                                  </p>
                                  {q.vault_question_id && (
                                    <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full flex-shrink-0">
                                      ✓ In vault
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-white mb-3">{q.prompt}</p>
                                <div className="space-y-1.5">
                                  {opts.map(o => {
                                    const isCorrect = o.key === q.correct_option
                                    return (
                                      <div key={o.key} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-sm ${
                                        isCorrect ? 'border-green-400/40 bg-green-500/10 text-green-300' : 'border-white/8 text-gray-400'
                                      }`}>
                                        <span className="font-bold text-xs w-3.5 flex-shrink-0">{o.label}</span>
                                        <span className="flex-1">{o.text}</span>
                                        {isCorrect && <span className="text-xs font-semibold text-green-400 flex-shrink-0">✓</span>}
                                      </div>
                                    )
                                  })}
                                </div>
                                {q.explanation && (
                                  <p className="text-xs text-gray-500 mt-2.5 italic">💡 {q.explanation}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Admin actions */}
                      <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-white/10">

                        {sub.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(sub.id)}
                              disabled={processing === sub.id}
                              className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              {processing === sub.id ? 'Approving…' : '✓ Approve Set'}
                            </button>
                            <button
                              onClick={() => setRejectId(rejectId === sub.id ? null : sub.id)}
                              disabled={processing === sub.id}
                              className="text-sm border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {sub.status === 'approved' && (
                          <button
                            onClick={() => setScheduleId(scheduleId === sub.id ? null : sub.id)}
                            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
                          >
                            📅 Create Daily Set Draft
                          </button>
                        )}

                      </div>

                      {/* Reject panel */}
                      {rejectId === sub.id && (
                        <div className="mt-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-3">
                          <p className="text-sm font-semibold text-red-400">Reject this set</p>
                          <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Optional feedback for the submitter…"
                            rows={2}
                            className="w-full bg-white/5 text-white border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 resize-none placeholder-gray-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReject(sub.id)}
                              disabled={processing === sub.id}
                              className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              {processing === sub.id ? 'Rejecting…' : 'Confirm Reject'}
                            </button>
                            <button onClick={() => { setRejectId(null); setNotes('') }} className="text-sm text-gray-400 px-3 py-1.5 hover:text-gray-200">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Schedule panel */}
                      {scheduleId === sub.id && (
                        <div className="mt-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 space-y-3">
                          <p className="text-sm font-semibold text-indigo-300">Create a draft daily set from this submission</p>
                          <p className="text-xs text-gray-400">
                            Picks a date and pre-loads all 10 vault questions. You can reorder,
                            swap questions, and publish from the Daily Set admin page.
                          </p>
                          <div className="flex gap-2 items-center">
                            <input
                              type="date"
                              value={scheduleDate}
                              min={minDate}
                              onChange={e => setScheduleDate(e.target.value)}
                              className="bg-white/5 text-white border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                            <button
                              onClick={() => handleSchedule(sub.id)}
                              disabled={scheduling || !scheduleDate}
                              className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {scheduling ? 'Creating…' : 'Create Draft →'}
                            </button>
                            <button onClick={() => { setScheduleId(null); setScheduleDate('') }} className="text-sm text-gray-400 hover:text-gray-200">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

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
