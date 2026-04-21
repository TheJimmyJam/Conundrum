import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabase'
import {
  adminGetDailySets,
  adminGetSetQuestions,
  adminReorderSetQuestions,
  adminScheduleQuestionAsCommunity,
  adminGetQuestionRankings,
  type AdminDailySet,
  type AdminSetQuestion,
  type RankedQuestion,
} from '../../lib/api'
import { getTierInfo, EINSTEIN_SCALE_NAME } from '../../lib/questionTier'
import type { Category } from '../../types'

const PAGE_SIZE = 50
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

type Tab = 'all' | 'upcoming' | 'rankings'

type Question = {
  id: string
  prompt: string
  difficulty: string
  is_active: boolean
  created_at: string
  category_id: string
  category_name: string
}

type NewQ = {
  prompt: string
  category_id: string
  difficulty: 'easy' | 'medium' | 'hard'
  explanation: string
  options: string[]
  correct_index: number
}

const emptyNew = (): NewQ => ({
  prompt: '',
  category_id: '',
  difficulty: 'medium',
  explanation: '',
  options: ['', '', '', ''],
  correct_index: 0,
})

// ── Tier badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: number | null | undefined }) {
  const info = getTierInfo(tier ?? null)
  if (!tier) return null
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${info.color} ${info.textColor} ${info.borderColor}`}>
      {info.shortName}
    </span>
  )
}

// ── Sortable row for Upcoming Daily ─────────────────────────────────────────

function SortableQuestionRow({
  q,
  index,
  diffBadge,
}: {
  q: AdminSetQuestion
  index: number
  diffBadge: (d: string) => string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.dsq_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 bg-gray-50 border border-transparent ${isDragging ? 'border-indigo-300 shadow-md' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 focus:outline-none"
        title="Drag to reorder"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </button>
      <span className="text-xs font-bold text-gray-400 w-5 text-center flex-shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 font-medium truncate" title={q.prompt}>{q.prompt}</p>
        <p className="text-xs text-gray-400 mt-0.5">{q.category}</p>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${diffBadge(q.difficulty)}`}>
        {q.difficulty}
      </span>
    </div>
  )
}

// ── Queue as Community Question modal ───────────────────────────────────────

function ScheduleCommunityModal({
  question,
  onClose,
  onScheduled,
}: {
  question: Question
  onClose: () => void
  onScheduled: (msg: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleQueue() {
    setSaving(true)
    setError(null)
    try {
      const date = await adminScheduleQuestionAsCommunity(question.id)
      const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      onScheduled(`✓ Queued as community question for ${dateStr}.`)
      onClose()
    } catch (err: any) {
      const msg: string = err?.message ?? 'Failed to queue'
      // Reformat the cooldown error into something readable
      if (msg.includes('cannot be queued again until')) {
        const match = msg.match(/until ([^.]+)/)
        const until = match ? new Date(match[1]).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'next year'
        setError(`⏳ On cooldown — this question was recently featured. Eligible again on ${until}.`)
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Queue as Community Question</h3>
            <p className="text-xs text-gray-400 mt-0.5">Added to the next available daily slot</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 line-clamp-3 mb-5">{question.prompt}</p>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleQueue}
            disabled={saving}
            className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Queuing…' : '📅 Add to Queue'}
          </button>
          <button onClick={onClose} className="border border-gray-200 text-gray-600 text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rankings tab ─────────────────────────────────────────────────────────────

function RankingsTab({ categories }: { categories: Category[] }) {
  const [rows, setRows] = useState<RankedQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tierFilter, setTierFilter] = useState<number | null>(null)
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [totalRanked, setTotalRanked] = useState(0)
  const PAGE = 100

  useEffect(() => { setPage(0) }, [tierFilter, catFilter])
  useEffect(() => { load() }, [tierFilter, catFilter, page])

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await adminGetQuestionRankings({
        limit: PAGE,
        offset: page * PAGE,
        tier: tierFilter,
        category_id: catFilter,
      })
      setRows(data)
      if (data.length > 0) setTotalRanked(data[0].total_ranked)
    } catch (err: any) {
      console.error('Rankings load error:', err)
      setLoadError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.ceil(totalRanked / PAGE)

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-gray-500 text-sm flex-1">
          {totalRanked.toLocaleString()} questions ranked on the {EINSTEIN_SCALE_NAME} · tiers assigned by correct-rate percentile (NTILE 10)
        </p>
      </div>

      {/* Tier legend */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {[null, ...Array.from({ length: 10 }, (_, i) => i + 1)].map(t => {
          const info = getTierInfo(t)
          const active = tierFilter === t
          return (
            <button
              key={t ?? 'all'}
              onClick={() => setTierFilter(t)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                active
                  ? `${info.color} ${info.textColor} ${info.borderColor} ring-2 ring-offset-1 ring-current`
                  : `${info.color} ${info.textColor} ${info.borderColor} opacity-70 hover:opacity-100`
              }`}
            >
              {t === null ? 'All' : `${t}. ${info.shortName}`}
            </button>
          )
        })}
      </div>

      <div className="flex gap-3 mb-5">
        <select
          value={catFilter ?? ''}
          onChange={e => setCatFilter(e.target.value || null)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent" />
        </div>
      ) : loadError ? (
        <div className="bg-white border border-red-100 rounded-2xl px-6 py-10 text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <p className="text-red-500 text-sm mb-1 font-semibold">Failed to load rankings</p>
          <p className="text-gray-400 text-xs mb-4 font-mono">{loadError}</p>
          <button onClick={load} className="text-sm text-indigo-600 hover:underline">Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl px-6 py-16 text-center">
          <div className="text-3xl mb-2">📊</div>
          <p className="text-gray-400 text-sm">No ranked questions yet. Data populates as players answer.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-12">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-20">Einstein</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Question</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Category</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Plays</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Correct %</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Wilson
                  <span className="ml-1 text-gray-300 font-normal normal-case">(0–100)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const _info = getTierInfo(r.tier)
                const pct = Math.round(r.correct_rate * 100)
                // Wilson bar: high score = easy (green), low score = hard (red)
                const wilsonColor = r.wilson_score >= 60 ? 'bg-green-400' :
                                    r.wilson_score >= 35 ? 'bg-yellow-400' : 'bg-red-400'
                return (
                  <tr key={r.question_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                      {r.overall_rank}
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={r.tier} />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-gray-900 font-medium truncate text-xs" title={r.prompt}>{r.prompt}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{r.category}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 hidden sm:table-cell">{r.total_answers.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 hidden sm:table-cell">{pct}%</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block">
                          <div className={`h-full rounded-full ${wilsonColor}`} style={{ width: `${r.wilson_score}%` }} />
                        </div>
                        <span className="text-xs font-bold tabular-nums text-gray-700 w-10 text-right">
                          {r.wilson_score.toFixed(1)}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, totalRanked)} of {totalRanked.toLocaleString()}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Upcoming Daily tab ───────────────────────────────────────────────────────

function UpcomingDaily({ diffBadge }: { diffBadge: (d: string) => string }) {
  const [sets, setSets] = useState<AdminDailySet[]>([])
  const [loading, setLoading] = useState(true)
  const [setQuestions, setSetQuestions] = useState<Record<string, AdminSetQuestion[]>>({})
  const [loadingSet, setLoadingSet] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    adminGetDailySets()
      .then(all => {
        const upcoming = all.filter(s => s.set_date >= today).sort((a, b) => a.set_date.localeCompare(b.set_date))
        setSets(upcoming)
      })
      .catch(err => showToast(`✗ ${err?.message}`))
      .finally(() => setLoading(false))
  }, [])

  async function expand(setId: string) {
    if (expanded === setId) { setExpanded(null); return }
    setExpanded(setId)
    if (setQuestions[setId]) return
    setLoadingSet(setId)
    try {
      const qs = await adminGetSetQuestions(setId)
      setSetQuestions(prev => ({ ...prev, [setId]: [...qs].sort((a, b) => a.slot - b.slot) }))
    } catch (err: any) {
      showToast(`✗ ${err?.message}`)
    } finally {
      setLoadingSet(null)
    }
  }

  function handleDragEnd(event: DragEndEvent, setId: string) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSetQuestions(prev => {
      const qs = [...(prev[setId] ?? [])]
      const oldIdx = qs.findIndex(q => q.dsq_id === active.id)
      const newIdx = qs.findIndex(q => q.dsq_id === over.id)
      return { ...prev, [setId]: arrayMove(qs, oldIdx, newIdx) }
    })
  }

  async function saveOrder(setId: string) {
    const qs = setQuestions[setId]
    if (!qs) return
    setSaving(setId)
    try {
      await adminReorderSetQuestions(setId, qs.map(q => q.dsq_id))
      showToast('✓ Order saved.')
    } catch (err: any) {
      showToast(`✗ ${err?.message}`)
    } finally {
      setSaving(null)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (sets.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl px-6 py-16 text-center">
        <div className="text-3xl mb-2">📅</div>
        <p className="text-gray-400 text-sm">No upcoming daily sets scheduled.</p>
        <p className="text-gray-400 text-xs mt-1">Go to Daily Sets to create and schedule one.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {sets.map((s, si) => {
          const isOpen = expanded === s.id
          const qs = setQuestions[s.id] ?? []
          const dateObj = new Date(s.set_date + 'T12:00:00')
          const isToday = s.set_date === today
          const isTomorrow = s.set_date === new Date(Date.now() + 86400000).toISOString().slice(0, 10)

          return (
            <div key={s.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <button
                onClick={() => expand(s.id)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-shrink-0 w-12 text-center">
                  {si === 0 && (
                    <span className="text-xs font-bold text-white bg-indigo-500 px-1.5 py-0.5 rounded mb-0.5 block">
                      {isToday ? 'TODAY' : isTomorrow ? 'NEXT' : 'UP'}
                    </span>
                  )}
                  <p className="text-xs font-semibold text-indigo-600">
                    {dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-xs text-gray-400">{dateObj.getFullYear()}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{s.title ?? <span className="text-gray-400 italic">Untitled set</span>}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.question_count}/10 questions</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${s.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.is_published ? 'Live' : 'Draft'}
                </span>
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-4">
                  {loadingSet === s.id ? (
                    <div className="flex justify-center py-6">
                      <div className="animate-spin rounded-full h-5 w-5 border-4 border-indigo-600 border-t-transparent" />
                    </div>
                  ) : qs.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No questions in this set yet.</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400 mb-3">Drag to reorder. Questions play top to bottom.</p>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={e => handleDragEnd(e, s.id)}
                      >
                        <SortableContext
                          items={qs.map(q => q.dsq_id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {qs.map((q, i) => (
                              <SortableQuestionRow key={q.dsq_id} q={q} index={i} diffBadge={diffBadge} />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          onClick={() => saveOrder(s.id)}
                          disabled={saving === s.id}
                          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {saving === s.id ? 'Saving…' : 'Save Order'}
                        </button>
                        <p className="text-xs text-gray-400">Saves immediately to the database.</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminQuestions() {
  const [tab, setTab] = useState<Tab>('all')

  // All questions tab state
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [diffFilter, setDiffFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newQ, setNewQ] = useState<NewQ>(emptyNew())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addToDailyQ, setAddToDailyQ] = useState<Question | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('categories').select('*').order('name')
      .then(({ data }) => setCategories((data ?? []) as Category[]))
  }, [])

  useEffect(() => { setPage(0) }, [search, categoryFilter, diffFilter, activeFilter])
  useEffect(() => { if (tab === 'all') load() }, [page, search, categoryFilter, diffFilter, activeFilter, tab])

  async function load() {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabase
      .from('questions')
      .select(`id, prompt, difficulty, is_active, created_at, category_id, categories ( name )`, { count: 'exact' })

    if (search)         q = q.ilike('prompt', `%${search}%`)
    if (categoryFilter) q = q.eq('category_id', categoryFilter)
    if (diffFilter)     q = q.eq('difficulty', diffFilter)
    if (activeFilter === 'active')   q = q.eq('is_active', true)
    if (activeFilter === 'inactive') q = q.eq('is_active', false)

    const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to)
    if (!error) {
      setQuestions((data ?? []).map((r: any) => ({ ...r, category_name: r.categories?.name ?? '—' })))
      setTotal(count ?? 0)
    }
    setLoading(false)
  }

  async function toggleActive(q: Question) {
    setToggling(q.id)
    await supabase.from('questions').update({ is_active: !q.is_active }).eq('id', q.id)
    setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, is_active: !x.is_active } : x))
    setToggling(null)
  }

  async function handleAdd() {
    setSaveError(null)
    if (!newQ.prompt.trim()) return setSaveError('Question text is required.')
    if (!newQ.category_id)   return setSaveError('Select a category.')
    if (newQ.options.some(o => !o.trim())) return setSaveError('All four options are required.')

    setSaving(true)
    try {
      const { data: qRow, error: qErr } = await supabase
        .from('questions')
        .insert({
          prompt: newQ.prompt.trim(),
          category_id: newQ.category_id,
          difficulty: newQ.difficulty,
          question_type: 'multiple_choice',
          explanation: newQ.explanation.trim() || null,
          is_active: true,
        })
        .select().single()
      if (qErr) throw qErr

      const optRows = newQ.options.map((text, i) => ({
        question_id: qRow.id, option_text: text.trim(), sort_order: i,
      }))
      const { data: optData, error: optErr } = await supabase
        .from('question_options').insert(optRows).select()
      if (optErr) throw optErr

      const correctOptId = optData[newQ.correct_index]?.id
      if (!correctOptId) throw new Error('Could not identify correct option')
      const { error: ansErr } = await supabase
        .from('question_answers').insert({ question_id: qRow.id, correct_option_id: correctOptId })
      if (ansErr) throw ansErr

      setShowAdd(false)
      setNewQ(emptyNew())
      load()
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const diffBadge = (d: string) =>
    d === 'easy'   ? 'bg-green-100 text-green-700' :
    d === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                     'bg-red-100 text-red-700'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6">
          ← Admin
        </Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Questions</h1>
          {tab === 'all' && (
            <button
              onClick={() => { setShowAdd(true); setSaveError(null) }}
              className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700"
            >
              + Add Question
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-8">
          {([
            { key: 'all',      label: 'All Questions' },
            { key: 'upcoming', label: '📅 Upcoming Daily' },
            { key: 'rankings', label: '🏆 Rankings' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'upcoming' ? (
          <UpcomingDaily diffBadge={diffBadge} />
        ) : tab === 'rankings' ? (
          <RankingsTab categories={categories} />
        ) : (
          <>
            {/* Add question panel */}
            {showAdd && (
              <div className="bg-white border border-indigo-100 rounded-2xl p-6 mb-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">New Question</h2>
                  <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Question *</label>
                    <textarea rows={2} value={newQ.prompt}
                      onChange={e => setNewQ({ ...newQ, prompt: e.target.value })}
                      placeholder="Enter question text…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Category *</label>
                      <select value={newQ.category_id} onChange={e => setNewQ({ ...newQ, category_id: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        <option value="">Select category…</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Difficulty *</label>
                      <select value={newQ.difficulty} onChange={e => setNewQ({ ...newQ, difficulty: e.target.value as any })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2">Options * — select the correct answer</label>
                    <div className="space-y-2">
                      {newQ.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="radio" name="correct" checked={newQ.correct_index === i}
                            onChange={() => setNewQ({ ...newQ, correct_index: i })}
                            className="accent-green-500 w-4 h-4 flex-shrink-0" />
                          <span className="text-xs font-bold text-gray-400 w-4">{String.fromCharCode(65 + i)}</span>
                          <input type="text" value={opt}
                            onChange={e => { const opts = [...newQ.options]; opts[i] = e.target.value; setNewQ({ ...newQ, options: opts }) }}
                            placeholder={`Option ${String.fromCharCode(65 + i)}`}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Explanation (optional)</label>
                    <input type="text" value={newQ.explanation}
                      onChange={e => setNewQ({ ...newQ, explanation: e.target.value })}
                      placeholder="Why is this the correct answer?"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  {saveError && <p className="text-sm text-red-500">{saveError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button onClick={handleAdd} disabled={saving}
                      className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save Question'}
                    </button>
                    <button onClick={() => setShowAdd(false)}
                      className="border border-gray-200 text-gray-600 text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-gray-500 mb-5">{total.toLocaleString()} questions total. Use Categories → a category for bulk editing.</p>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-5">
              <input type="text" placeholder="Search questions…" value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                <option value="">All categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={diffFilter} onChange={e => setDiffFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                <option value="">All difficulties</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
              <select value={activeFilter} onChange={e => setActiveFilter(e.target.value as any)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                <option value="all">All status</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent" />
              </div>
            ) : questions.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl px-6 py-16 text-center">
                <div className="text-3xl mb-2">🔍</div>
                <p className="text-gray-400 text-sm">No questions match these filters.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Question</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Difficulty</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Active</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Daily</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map(q => (
                      <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3.5 max-w-xs">
                          <p className="text-gray-900 font-medium truncate" title={q.prompt}>{q.prompt}</p>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs hidden md:table-cell">{q.category_name}</td>
                        <td className="px-4 py-3.5 hidden sm:table-cell">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${diffBadge(q.difficulty)}`}>{q.difficulty}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <button onClick={() => toggleActive(q)} disabled={toggling === q.id}
                            title={q.is_active ? 'Disable' : 'Enable'}
                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none disabled:opacity-40 ${q.is_active ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                            <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${q.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => setAddToDailyQ(q)}
                            title="Queue as community question of the day"
                            className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold hover:underline"
                          >
                            📰 Queue
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
                      <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">Next →</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Schedule as community question modal */}
      {addToDailyQ && (
        <ScheduleCommunityModal
          question={addToDailyQ}
          onClose={() => setAddToDailyQ(null)}
          onScheduled={msg => { showToast(msg) }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
