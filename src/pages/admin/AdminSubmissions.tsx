import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  adminGetSubmissions,
  adminReviewSubmission,
  adminClearFeaturedSubmission,
  adminQueueSubmission,
  adminGetDailySetSubmissions,
  adminGetDailySetSubmissionQuestions,
  adminReviewDailySetSubmission,
  adminCreateSetFromSubmission,
  type AdminDailySetSubmission,
  type AdminDailySetSubmissionQuestion,
} from '../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionSubmission = {
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

type TopTab = 'community' | 'sets'

const Q_STATUS_FILTERS = ['pending', 'approved', 'featured', 'rejected']
const SET_STATUS_FILTERS = ['pending', 'approved', 'rejected']

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-500/15 text-amber-400',
  approved: 'bg-blue-500/15 text-blue-400',
  featured: 'bg-green-500/15 text-green-400',
  rejected: 'bg-red-500/15 text-red-400',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminSubmissions() {
  const navigate = useNavigate()
  const [topTab, setTopTab] = useState<TopTab>('community')

  // ── Community Question state ──
  const [qFilter, setQFilter] = useState('pending')
  const [questions, setQuestions] = useState<QuestionSubmission[]>([])
  const [qLoading, setQLoading] = useState(true)
  const [qExpanded, setQExpanded] = useState<string | null>(null)
  const [qProcessing, setQProcessing] = useState<string | null>(null)
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null)

  // ── Daily Sets state ──
  const [sFilter, setSFilter] = useState('pending')
  const [sets, setSets] = useState<AdminDailySetSubmission[]>([])
  const [sLoading, setSLoading] = useState(true)
  const [sExpanded, setSExpanded] = useState<string | null>(null)
  const [setQsMap, setSetQsMap] = useState<Record<string, AdminDailySetSubmissionQuestion[]>>({})
  const [sProcessing, setSProcessing] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduling, setScheduling] = useState(false)

  // Load on mount and filter change
  useEffect(() => { loadQuestions() }, [qFilter])
  useEffect(() => { loadSets() }, [sFilter])

  // ── Community Question loaders / handlers ──────────────────────────────────

  async function loadQuestions() {
    setQLoading(true)
    try {
      const all = await adminGetSubmissions(qFilter)
      // 'featured' tab = submissions already shown to users (today or past).
      // Future-queued items share the same status but belong in the Community
      // Question Queue page, not here.
      if (qFilter === 'featured') {
        const todayISO = new Date().toLocaleDateString('en-CA')
        setQuestions(all.filter((s: QuestionSubmission) => s.featured_date != null && s.featured_date <= todayISO))
      } else {
        setQuestions(all)
      }
    } catch (err) { console.error(err) }
    finally { setQLoading(false) }
  }

  async function handleQReview(id: string, status: string) {
    setQProcessing(id)
    try {
      await adminReviewSubmission(id, status)
      await loadQuestions()
      setQExpanded(null)
    } catch (err: any) { alert(err?.message ?? 'Error') }
    finally { setQProcessing(null) }
  }

  async function handleAddToQueue(id: string) {
    setQProcessing(id)
    setQueuedMsg(null)
    try {
      const position = await adminQueueSubmission(id)
      setQueuedMsg(`✓ Added to Community Question queue — position #${position}`)
      await loadQuestions()
      setQExpanded(null)
    } catch (err: any) { alert(err?.message ?? 'Error queueing') }
    finally { setQProcessing(null) }
  }

  async function handleClearFeatured(id: string) {
    setQProcessing(id)
    try {
      await adminClearFeaturedSubmission(id)
      await loadQuestions()
      setQExpanded(null)
    } catch (err: any) { alert(err?.message ?? 'Error') }
    finally { setQProcessing(null) }
  }

  // ── Daily Sets loaders / handlers ──────────────────────────────────────────

  async function loadSets() {
    setSLoading(true)
    setSExpanded(null)
    try {
      setSets(await adminGetDailySetSubmissions(sFilter))
    } catch (err) { console.error(err) }
    finally { setSLoading(false) }
  }

  async function toggleSetExpand(id: string) {
    if (sExpanded === id) { setSExpanded(null); return }
    setSExpanded(id)
    if (!setQsMap[id]) {
      try {
        const qs = await adminGetDailySetSubmissionQuestions(id)
        setSetQsMap(prev => ({ ...prev, [id]: qs }))
      } catch (err) { console.error(err) }
    }
  }

  async function handleAddSetToQueue(id: string) {
    if (!confirm('Add this set to the vault? All 10 questions will be approved and ready to schedule as a Daily Set.')) return
    setSProcessing(id)
    try {
      await adminReviewDailySetSubmission(id, 'approved')
      setSuccessMsg('Set added to vault — go to Daily Sets to schedule it.')
      await loadSets()
    } catch (err: any) { alert(err?.message ?? 'Error approving set') }
    finally { setSProcessing(null) }
  }

  async function handleRejectSet(id: string) {
    setSProcessing(id)
    try {
      await adminReviewDailySetSubmission(id, 'rejected', rejectNotes)
      setRejectId(null)
      setRejectNotes('')
      await loadSets()
    } catch (err: any) { alert(err?.message ?? 'Error rejecting') }
    finally { setSProcessing(null) }
  }

  async function handleScheduleSet(id: string) {
    if (!scheduleDate) { alert('Pick a date first.'); return }
    setScheduling(true)
    try {
      await adminCreateSetFromSubmission(id, scheduleDate)
      setScheduleId(null)
      setScheduleDate('')
      setSuccessMsg(`Draft daily set created for ${scheduleDate}.`)
      navigate('/admin/daily-set')
    } catch (err: any) { alert(err?.message ?? 'Error creating daily set') }
    finally { setScheduling(false) }
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 mb-6">
          ← Admin
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">Submissions</h1>
        <p className="text-gray-400 mb-8">
          Review community submissions. Add approved questions to their respective queues.
        </p>

        {/* ── Top tabs ── */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => { setTopTab('community'); setQueuedMsg(null); setSuccessMsg(null) }}
            className={`flex-1 py-4 rounded-2xl border text-sm font-semibold transition-all ${
              topTab === 'community'
                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                : 'border-white/10 bg-white/5 text-gray-400 hover:border-amber-500/30 hover:text-gray-200'
            }`}
          >
            <div className="text-2xl mb-1">💡</div>
            Community Question
            <div className="text-xs font-normal text-gray-500 mt-0.5">1 question submissions</div>
          </button>
          <button
            onClick={() => { setTopTab('sets'); setQueuedMsg(null); setSuccessMsg(null) }}
            className={`flex-1 py-4 rounded-2xl border text-sm font-semibold transition-all ${
              topTab === 'sets'
                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                : 'border-white/10 bg-white/5 text-gray-400 hover:border-amber-500/30 hover:text-gray-200'
            }`}
          >
            <div className="text-2xl mb-1">📋</div>
            Daily Sets
            <div className="text-xs font-normal text-gray-500 mt-0.5">10 question submissions</div>
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════
            COMMUNITY QUESTION TAB
        ════════════════════════════════════════════════════════ */}
        {topTab === 'community' && (
          <div>
            {queuedMsg && (
              <div className="mb-6 bg-green-500/10 border border-green-500/30 text-green-300 text-sm font-medium px-4 py-3 rounded-xl flex items-center justify-between">
                {queuedMsg}
                <button onClick={() => setQueuedMsg(null)} className="text-green-400 text-lg ml-4">×</button>
              </div>
            )}

            {/* Status filter tabs */}
            <div className="flex border-b border-white/10 mb-6">
              {Q_STATUS_FILTERS.map(s => (
                <button
                  key={s}
                  onClick={() => setQFilter(s)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                    qFilter === s ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {qLoading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent" />
              </div>
            ) : questions.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-16 text-center">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-400">No {qFilter} community question submissions.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {questions.map(s => {
                  const isOpen = qExpanded === s.id
                  const opts = [
                    { label: 'A', text: s.option_a },
                    { label: 'B', text: s.option_b },
                    { label: 'C', text: s.option_c },
                    { label: 'D', text: s.option_d },
                  ]
                  return (
                    <div key={s.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setQExpanded(isOpen ? null : s.id)}
                        className="w-full text-left px-5 py-4 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{s.prompt}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            by @{s.username} · {new Date(s.created_at).toLocaleDateString()}
                            {s.featured_date && ` · Scheduled: ${s.featured_date}`}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[s.status] ?? 'bg-gray-100 text-gray-400'}`}>
                          {s.status}
                        </span>
                        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="border-t border-white/10 px-5 pb-5 pt-4">
                          <div className="space-y-2 mb-4">
                            {opts.map(o => {
                              const isCorrect = o.label.toLowerCase() === s.correct_option
                              return (
                                <div key={o.label} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                                  isCorrect ? 'border-green-400/40 bg-green-500/10 text-green-300' : 'border-white/10 text-gray-300'
                                }`}>
                                  <span className="font-bold w-4 text-xs">{o.label}</span>
                                  <span className="flex-1">{o.text}</span>
                                  {isCorrect && <span className="text-xs font-semibold text-green-400">✓</span>}
                                </div>
                              )
                            })}
                          </div>

                          {s.explanation && (
                            <p className="text-xs text-gray-500 italic mb-4">💡 {s.explanation}</p>
                          )}

                          <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-white/10">
                            {s.status === 'pending' && (
                              <button
                                onClick={() => handleQReview(s.id, 'approved')}
                                disabled={qProcessing === s.id}
                                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                              >
                                Approve
                              </button>
                            )}

                            {s.status !== 'featured' && (
                              <button
                                onClick={() => handleAddToQueue(s.id)}
                                disabled={qProcessing === s.id}
                                className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                              >
                                {qProcessing === s.id ? 'Adding…' : '📅 Add to Queue'}
                              </button>
                            )}

                            {s.status === 'featured' && (
                              <button
                                onClick={() => {
                                  if (!confirm(`Remove from queue for ${s.featured_date}?`)) return
                                  handleClearFeatured(s.id)
                                }}
                                disabled={qProcessing === s.id}
                                className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                              >
                                Remove from Queue
                              </button>
                            )}

                            {s.status !== 'rejected' && s.status !== 'featured' && (
                              <button
                                onClick={() => { if (confirm('Reject this submission?')) handleQReview(s.id, 'rejected') }}
                                disabled={qProcessing === s.id}
                                className="text-sm border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50 ml-auto"
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
        )}

        {/* ════════════════════════════════════════════════════════
            DAILY SETS TAB
        ════════════════════════════════════════════════════════ */}
        {topTab === 'sets' && (
          <div>
            {successMsg && (
              <div className="mb-6 bg-green-500/10 border border-green-500/30 text-green-300 text-sm font-medium px-4 py-3 rounded-xl flex items-center justify-between">
                {successMsg}
                <button onClick={() => setSuccessMsg(null)} className="text-green-400 text-lg ml-4">×</button>
              </div>
            )}

            {/* Status filter tabs */}
            <div className="flex border-b border-white/10 mb-6">
              {SET_STATUS_FILTERS.map(s => (
                <button
                  key={s}
                  onClick={() => setSFilter(s)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                    sFilter === s ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {sLoading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent" />
              </div>
            ) : sets.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-16 text-center">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-400">No {sFilter} daily set submissions.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sets.map(sub => {
                  const isOpen = sExpanded === sub.id
                  const qs: AdminDailySetSubmissionQuestion[] = setQsMap[sub.id] ?? []

                  return (
                    <div key={sub.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => toggleSetExpand(sub.id)}
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
                                  onClick={() => handleAddSetToQueue(sub.id)}
                                  disabled={sProcessing === sub.id}
                                  className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                  {sProcessing === sub.id ? 'Adding…' : '📅 Add to Queue'}
                                </button>
                                <button
                                  onClick={() => setRejectId(rejectId === sub.id ? null : sub.id)}
                                  disabled={sProcessing === sub.id}
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
                                📅 Schedule as Daily Set
                              </button>
                            )}
                          </div>

                          {/* Reject panel */}
                          {rejectId === sub.id && (
                            <div className="mt-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-3">
                              <p className="text-sm font-semibold text-red-400">Reject this set</p>
                              <textarea
                                value={rejectNotes}
                                onChange={e => setRejectNotes(e.target.value)}
                                placeholder="Optional feedback for the submitter…"
                                rows={2}
                                className="w-full bg-white/5 text-white border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 resize-none placeholder-gray-500"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleRejectSet(sub.id)}
                                  disabled={sProcessing === sub.id}
                                  className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                                >
                                  {sProcessing === sub.id ? 'Rejecting…' : 'Confirm Reject'}
                                </button>
                                <button onClick={() => { setRejectId(null); setRejectNotes('') }} className="text-sm text-gray-400 px-3 py-1.5 hover:text-gray-200">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Schedule panel */}
                          {scheduleId === sub.id && (
                            <div className="mt-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 space-y-3">
                              <p className="text-sm font-semibold text-indigo-300">Schedule as a daily round</p>
                              <p className="text-xs text-gray-400">
                                Pick a date — all 10 vault questions will be pre-loaded as a draft. You can reorder and publish from Daily Sets.
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
                                  onClick={() => handleScheduleSet(sub.id)}
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
        )}

      </div>
    </div>
  )
}
