import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  adminGetDailySets,
  adminCreateDailySet,
  adminUpdateDailySet,
  adminGetSetQuestions,
  adminAddQuestionToSet,
  adminRemoveQuestionFromSet,
  adminSortSetByDifficulty,
  adminGetDailyQuestionUsage,
  adminAutoPopulateDailySets,
  adminDeleteDailySet,
  adminDeleteUpcomingSets,
  adminGoLiveNow,
  adminReorderSetQuestions,
  type AdminDailySet,
  type AdminSetQuestion,
  type DailyQuestionUsage,
} from '../../lib/api'
import { getTierInfo, tierFromRate, EINSTEIN_SCALE_NAME } from '../../lib/questionTier'

const SLOT_COUNT = 10

type PickerQuestion = {
  id: string
  prompt: string
  difficulty: string
  category_name: string
  correct_rate: number | null  // from question_stats join
}

// ── Usage badge helper ───────────────────────────────────────────────────────

function UsageBadge({ usage }: { usage: DailyQuestionUsage | undefined }) {
  if (!usage) return null
  if (usage.upcoming_date) {
    return (
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/100/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
        📅 Scheduled {usage.upcoming_date}
      </span>
    )
  }
  return (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-white/10 text-gray-400 border border-white/10 whitespace-nowrap">
      ✓ Used {usage.times_used}×
    </span>
  )
}

export default function AdminDailySet() {
  const [sets, setSets] = useState<AdminDailySet[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [setQuestions, setSetQuestions] = useState<Record<string, AdminSetQuestion[]>>({})
  const [loadingQs, setLoadingQs] = useState<string | null>(null)

  // Question usage tracking (loaded once on mount)
  const [usageMap, setUsageMap] = useState<Record<string, DailyQuestionUsage>>({})

  // New set form
  const [showNew, setShowNew] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Inline title editing per set
  const [editingTitle, setEditingTitle] = useState<Record<string, string>>({})
  const [savingSet, setSavingSet] = useState<string | null>(null)

  // Publishing
  const [togglingPublish, setTogglingPublish] = useState<string | null>(null)

  // Removing / sorting
  const [removing, setRemoving] = useState<string | null>(null)
  const [sorting, setSorting] = useState<string | null>(null)

  // Per-question detail expand (question_id → details)
  const [expandedQ, setExpandedQ] = useState<string | null>(null)
  type QDetail = { options: { id: string; text: string; sort_order: number }[]; correct_option_id: string; explanation: string | null }
  const [qDetails, setQDetails] = useState<Record<string, QDetail>>({})

  // Question picker modal
  const [pickerFor, setPickerFor] = useState<{ setId: string; slot: number } | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerResults, setPickerResults] = useState<PickerQuestion[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [hideUsed, setHideUsed] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-populate
  const [autofilling, setAutofilling] = useState(false)

  // Delete confirmation (individual)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Go Live Now
  const [confirmGoLive, setConfirmGoLive] = useState<string | null>(null)
  const [goingLive, setGoingLive] = useState(false)

  // Bulk delete upcoming
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  // Toast
  const [toast, setToast] = useState<string | null>(null)

  // Drag-to-reorder
  const [dragFromSlot, setDragFromSlot] = useState<{ setId: string; slot: number } | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)

  useEffect(() => {
    load()
    loadUsage()
  }, [])

  async function load() {
    setLoading(true)
    try {
      setSets(await adminGetDailySets())
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed to load sets'}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadUsage() {
    try {
      const rows = await adminGetDailyQuestionUsage()
      const map: Record<string, DailyQuestionUsage> = {}
      rows.forEach(r => { map[r.question_id] = r })
      setUsageMap(map)
    } catch { /* non-critical */ }
  }

  async function handleAutoFill() {
    setAutofilling(true)
    try {
      const result = await adminAutoPopulateDailySets(7)
      if (result.created_count === 0) {
        showToast(`✓ All 7 days already have sets — nothing to create.`)
      } else {
        const dateList = result.dates_created.map(d =>
          new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        ).join(', ')
        showToast(`✓ Created ${result.created_count} set${result.created_count !== 1 ? 's' : ''}: ${dateList}`)
      }
      await load()
      await loadUsage()
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Auto-fill failed'}`)
    } finally {
      setAutofilling(false)
    }
  }

  async function expand(setId: string) {
    if (expanded === setId) { setExpanded(null); return }
    setExpanded(setId)
    if (setQuestions[setId]) return
    setLoadingQs(setId)
    try {
      const qs = await adminGetSetQuestions(setId)
      setSetQuestions(prev => ({ ...prev, [setId]: qs }))
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed to load questions'}`)
    } finally {
      setLoadingQs(null)
    }
  }

  async function handleCreate() {
    setCreateError(null)
    if (!newDate) return setCreateError('Pick a date.')
    setCreating(true)
    try {
      const id = await adminCreateDailySet(newDate, newTitle.trim() || undefined)
      await load()
      setShowNew(false)
      setNewDate('')
      setNewTitle('')
      setExpanded(id)
    } catch (err: any) {
      setCreateError(err?.message ?? 'Failed to create set')
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveTitle(s: AdminDailySet) {
    const title = editingTitle[s.id] ?? s.title ?? ''
    setSavingSet(s.id)
    try {
      await adminUpdateDailySet(s.id, title.trim() || null, s.is_published)
      setSets(prev => prev.map(x => x.id === s.id ? { ...x, title: title.trim() || null } : x))
      setEditingTitle(prev => { const n = { ...prev }; delete n[s.id]; return n })
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed to save'}`)
    } finally {
      setSavingSet(null)
    }
  }

  async function handleTogglePublish(s: AdminDailySet) {
    const qs = setQuestions[s.id]
    if (!s.is_published && (!qs || qs.length < SLOT_COUNT)) {
      showToast(`⚠ Set needs ${SLOT_COUNT} questions before publishing (has ${qs?.length ?? '?'}).`)
      return
    }
    setTogglingPublish(s.id)
    try {
      await adminUpdateDailySet(s.id, s.title ?? null, !s.is_published)
      setSets(prev => prev.map(x => x.id === s.id ? { ...x, is_published: !x.is_published } : x))
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally {
      setTogglingPublish(null)
    }
  }

  async function handleRemoveQuestion(dsqId: string, setId: string) {
    setRemoving(dsqId)
    try {
      await adminRemoveQuestionFromSet(dsqId)
      setSetQuestions(prev => ({
        ...prev,
        [setId]: (prev[setId] ?? []).filter(q => q.dsq_id !== dsqId),
      }))
      setSets(prev => prev.map(x => x.id === setId ? { ...x, question_count: x.question_count - 1 } : x))
      // Refresh usage (a slot was freed)
      loadUsage()
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally {
      setRemoving(null)
    }
  }

  async function handleSort(setId: string) {
    setSorting(setId)
    try {
      await adminSortSetByDifficulty(setId)
      // Reload slot order from DB
      const qs = await adminGetSetQuestions(setId)
      setSetQuestions(prev => ({ ...prev, [setId]: qs }))
      showToast('✓ Sorted easiest → hardest.')
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Sort failed'}`)
    } finally {
      setSorting(null)
    }
  }

  async function handleDeleteSet(setId: string) {
    setDeleting(true)
    try {
      await adminDeleteDailySet(setId)
      setSets(prev => prev.filter(x => x.id !== setId))
      setSetQuestions(prev => { const n = { ...prev }; delete n[setId]; return n })
      if (expanded === setId) setExpanded(null)
      setConfirmDelete(null)
      showToast('✓ Set deleted.')
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Delete failed'}`)
    } finally {
      setDeleting(false)
    }
  }

  async function handleGoLiveNow(setId: string) {
    setGoingLive(true)
    try {
      await adminGoLiveNow(setId)
      await load()
      setConfirmGoLive(null)
      showToast('⚡ Set is now live on the homepage!')
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed to go live'}`)
      setConfirmGoLive(null)
    } finally {
      setGoingLive(false)
    }
  }

  async function handleDeleteAllUpcoming() {
    setDeletingAll(true)
    try {
      const count = await adminDeleteUpcomingSets()
      setSets(prev => prev.filter(s => s.set_date <= new Date().toISOString().slice(0, 10) || s.is_published))
      await load()
      setConfirmDeleteAll(false)
      showToast(`✓ Deleted ${count} upcoming draft set${count !== 1 ? 's' : ''}.`)
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Delete failed'}`)
    } finally {
      setDeletingAll(false)
    }
  }

  // ── Question detail expand ───────────────────────────────────────────────────

  async function toggleQDetail(questionId: string) {
    if (expandedQ === questionId) { setExpandedQ(null); return }
    setExpandedQ(questionId)
    if (qDetails[questionId]) return  // already cached
    try {
      const { data, error } = await supabase.rpc('admin_get_question_detail', { p_question_id: questionId })
      if (error) throw error
      const correctOpt = (data?.options ?? []).find((o: any) => o.is_correct)
      setQDetails(prev => ({
        ...prev,
        [questionId]: {
          options: (data?.options ?? []).map((o: any) => ({ id: o.id, text: o.option_text, sort_order: o.sort_order })),
          correct_option_id: correctOpt?.id ?? '',
          explanation: data?.explanation ?? null,
        },
      }))
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed to load question details'}`)
    }
  }

  // ── Question picker ──────────────────────────────────────────────────────────

  function openPicker(setId: string, slot: number) {
    setPickerFor({ setId, slot })
    setPickerSearch('')
    setPickerResults([])
    searchPicker('', setId)
  }

  function closePicker() {
    setPickerFor(null)
    setPickerSearch('')
    setPickerResults([])
    if (searchTimer.current) clearTimeout(searchTimer.current)
  }

  function onPickerSearchChange(val: string) {
    if (!pickerFor) return
    setPickerSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchPicker(val, pickerFor.setId), 300)
  }

  async function searchPicker(q: string, _setId: string) {
    setPickerLoading(true)
    try {
      let query = supabase
        .from('questions')
        .select('id, prompt, difficulty, categories ( name ), question_stats ( total_answers, correct_answers )')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50)
      if (q.trim()) query = query.ilike('prompt', `%${q.trim()}%`)
      const { data, error } = await query
      if (error) throw error
      setPickerResults((data ?? []).map((r: any) => {
        const stats = r.question_stats
        const rate = stats && stats.total_answers > 0
          ? stats.correct_answers / stats.total_answers
          : null
        return {
          id: r.id,
          prompt: r.prompt,
          difficulty: r.difficulty,
          category_name: r.categories?.name ?? '—',
          correct_rate: rate,
        }
      }))
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Search failed'}`)
    } finally {
      setPickerLoading(false)
    }
  }

  async function handleAddQuestion(question: PickerQuestion) {
    if (!pickerFor) return
    const { setId, slot } = pickerFor
    setAdding(question.id)
    try {
      await adminAddQuestionToSet(setId, question.id, slot)
      const qs = await adminGetSetQuestions(setId)
      setSetQuestions(prev => ({ ...prev, [setId]: qs }))
      setSets(prev => prev.map(x => x.id === setId ? { ...x, question_count: qs.length } : x))
      loadUsage()
      closePicker()
      showToast(`✓ Question added to slot ${slot}.`)
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed to add'}`)
    } finally {
      setAdding(null)
    }
  }

  // ── Drag-to-reorder ──────────────────────────────────────────────────────────

  function handleDragStart(setId: string, slot: number) {
    setDragFromSlot({ setId, slot })
  }

  function handleDragOver(e: React.DragEvent, slot: number) {
    e.preventDefault()
    setDragOverSlot(slot)
  }

  function handleDragEnd() {
    setDragFromSlot(null)
    setDragOverSlot(null)
  }

  async function handleDrop(e: React.DragEvent, toSlot: number, setId: string) {
    e.preventDefault()
    if (!dragFromSlot || dragFromSlot.setId !== setId || dragFromSlot.slot === toSlot) {
      handleDragEnd()
      return
    }

    const fromSlot = dragFromSlot.slot
    const qs = setQuestions[setId] ?? []

    // Build full 10-slot array (null = empty)
    const slotArray: (AdminSetQuestion | null)[] = Array(SLOT_COUNT).fill(null)
    for (const q of qs) slotArray[q.slot - 1] = q

    // Remove from source, insert at destination (shift-style)
    const [item] = slotArray.splice(fromSlot - 1, 1)
    slotArray.splice(toSlot - 1, 0, item)

    // Reassign slot numbers
    const newQs = slotArray
      .map((q, i) => q ? { ...q, slot: i + 1 } : null)
      .filter(Boolean) as AdminSetQuestion[]

    // Optimistic update
    setSetQuestions(prev => ({ ...prev, [setId]: newQs }))
    handleDragEnd()

    // Persist
    try {
      await adminReorderSetQuestions(setId, newQs.map(q => q.dsq_id))
    } catch (err: any) {
      // Rollback on failure
      setSetQuestions(prev => ({ ...prev, [setId]: qs }))
      showToast(`✗ Failed to save new order`)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  // Use ET date so 'live' detection matches the DB function (which also uses ET)
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

  const diffBadge = (d: string) =>
    d === 'easy'   ? 'bg-green-500/100/15 text-green-400' :
    d === 'medium' ? 'bg-yellow-500/15 text-yellow-400' :
                     'bg-red-500/100/15 text-red-400'

  function slotMap(setId: string): Record<number, AdminSetQuestion | undefined> {
    const result: Record<number, AdminSetQuestion | undefined> = {}
    for (let i = 1; i <= SLOT_COUNT; i++) result[i] = undefined
    for (const q of (setQuestions[setId] ?? [])) result[q.slot] = q
    return result
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 mb-6">
          ← Admin
        </Link>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-white">Daily Sets</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoFill}
              disabled={autofilling}
              className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-amber-500/30 text-amber-400 hover:bg-amber-500/100/10 disabled:opacity-50 flex items-center gap-2"
            >
              {autofilling ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-amber-500 border-t-transparent" />
                  Generating…
                </>
              ) : (
                '🤖 Add 7 days'
              )}
            </button>
            <button
              onClick={() => { setShowNew(true); setCreateError(null) }}
              className="bg-amber-500/100 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-amber-600"
            >
              + New Set
            </button>
          </div>
        </div>
        <p className="text-gray-400 mb-8">
          10-question sets that reset daily at 6 AM ET — questions go easiest → hardest.
          Use <strong className="font-semibold text-gray-200">Add 7 days</strong> to queue 7 more draft sets after the latest scheduled date — click it multiple times to build further out. Review and publish each one before it goes live.
        </p>

        {/* New set form */}
        {showNew && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">New Daily Set</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Date *</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Title (optional)</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Science Special"
                  className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            {createError && <p className="text-sm text-red-500 mb-3">{createError}</p>}
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating}
                className="bg-amber-500/100 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-amber-600 disabled:opacity-50">
                {creating ? 'Creating…' : 'Create Set'}
              </button>
              <button onClick={() => setShowNew(false)}
                className="border border-white/10 text-gray-300 text-sm px-4 py-2.5 rounded-xl hover:bg-white/5">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sets list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent" />
          </div>
        ) : sets.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-16 text-center">
            <div className="text-3xl mb-2">📅</div>
            <p className="text-gray-400 text-sm">No daily sets yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map(s => {
              const isOpen = expanded === s.id
              const slots = slotMap(s.id)
              const qCount = setQuestions[s.id]?.length ?? s.question_count
              const isEditingTitle = s.id in editingTitle

              return (
                <div key={s.id} className={`rounded-2xl overflow-hidden border ${
                  s.is_published && s.set_date === todayISO
                    ? 'bg-green-500/5 border-green-500/40 ring-1 ring-green-500/20'
                    : 'bg-white/5 border-white/10'
                }`}>
                  {/* Header row */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    <button
                      onClick={() => expand(s.id)}
                      className="flex-1 text-left flex items-center gap-4 min-w-0"
                    >
                      <div className="flex-shrink-0 text-center">
                        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                          {new Date(s.set_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(s.set_date + 'T12:00:00').getFullYear()}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        {isEditingTitle ? (
                          <input
                            type="text"
                            value={editingTitle[s.id]}
                            onChange={e => setEditingTitle(prev => ({ ...prev, [s.id]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveTitle(s)
                              if (e.key === 'Escape') setEditingTitle(prev => { const n = { ...prev }; delete n[s.id]; return n })
                            }}
                            autoFocus
                            className="border border-amber-500/40 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        ) : (
                          <p className="font-semibold text-white text-sm truncate">
                            {s.title ?? <span className="text-gray-400 italic">Untitled set</span>}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{qCount}/{SLOT_COUNT} questions</p>
                      </div>
                      <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {confirmDelete === s.id ? (
                        <>
                          <span className="text-xs text-red-400 font-semibold">Delete this set?</span>
                          <button
                            onClick={() => handleDeleteSet(s.id)}
                            disabled={deleting}
                            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            {deleting ? 'Deleting…' : 'Yes, delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs border border-white/10 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {isEditingTitle ? (
                            <>
                              <button onClick={() => handleSaveTitle(s)} disabled={savingSet === s.id}
                                className="text-xs bg-amber-500/100 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-50">
                                {savingSet === s.id ? 'Saving…' : 'Save'}
                              </button>
                              <button onClick={() => setEditingTitle(prev => { const n = { ...prev }; delete n[s.id]; return n })}
                                className="text-xs border border-white/10 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-white/5">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setEditingTitle(prev => ({ ...prev, [s.id]: s.title ?? '' }))}
                              className="text-xs border border-white/10 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-white/5">
                              ✏ Edit title
                            </button>
                          )}

                          {/* Go Live Now — only for sets not already live today */}
                          {!(s.is_published && s.set_date === todayISO) && (
                            confirmGoLive === s.id ? (
                              <>
                                <span className="text-xs text-amber-700 font-semibold">Go live now?</span>
                                <button
                                  onClick={() => handleGoLiveNow(s.id)}
                                  disabled={goingLive}
                                  className="text-xs bg-amber-500/100 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-50"
                                >
                                  {goingLive ? 'Going live…' : '⚡ Yes, go live'}
                                </button>
                                <button
                                  onClick={() => setConfirmGoLive(null)}
                                  className="text-xs border border-white/10 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-white/5"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => { setConfirmDelete(null); setConfirmGoLive(s.id) }}
                                title="Push this set live on the homepage right now"
                                className="text-xs border border-amber-300 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                              >
                                ⚡ Go Live
                              </button>
                            )
                          )}

                          <button
                            onClick={() => handleTogglePublish(s)}
                            disabled={togglingPublish === s.id}
                            title={s.is_published ? 'Unpublish' : 'Publish'}
                            className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none disabled:opacity-40 ${s.is_published ? 'bg-amber-500/100' : 'bg-gray-200'}`}>
                            <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${s.is_published ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                          {s.is_published && s.set_date === todayISO ? (
                            <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/40">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                              LIVE NOW
                            </span>
                          ) : (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.is_published ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-gray-400'}`}>
                              {s.is_published ? 'Published' : 'Draft'}
                            </span>
                          )}
                          <button
                            onClick={() => { setConfirmGoLive(null); setConfirmDelete(s.id) }}
                            className="text-xs border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 hover:border-red-300 transition-colors"
                          >Delete</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded: slots */}
                  {isOpen && (
                    <div className={`border-t px-5 py-4 ${s.is_published && s.set_date === todayISO ? 'border-green-500/20' : 'border-white/10'}`}>
                      {s.is_published && s.set_date === todayISO && (
                        <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-sm text-green-400 font-medium">
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                          This set is live on the homepage right now. Players who refresh will see these questions.
                        </div>
                      )}
                      {loadingQs === s.id ? (
                        <div className="flex justify-center py-6">
                          <div className="animate-spin rounded-full h-6 w-6 border-4 border-amber-500 border-t-transparent" />
                        </div>
                      ) : (
                        <>
                          {/* Difficulty progression indicator */}
                          {qCount > 0 && (
                            <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
                              <span>Slot 1 (easiest)</span>
                              <div className="flex-1 h-1.5 rounded-full bg-gradient-to-r from-emerald-300 via-yellow-300 to-red-400" />
                              <span>Slot 10 (hardest)</span>
                            </div>
                          )}

                          <div className="space-y-2">
                            {Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map(slot => {
                              const q = slots[slot]
                              const usage = q ? usageMap[q.question_id] : undefined
                              const usedElsewhere = usage && (usage.times_used > 1 || (usage.times_used === 1 && usage.upcoming_date && usage.upcoming_date !== s.set_date?.toString()))
                              const isDraggingThis = dragFromSlot?.setId === s.id && dragFromSlot?.slot === slot
                              const isDragOver = dragFromSlot?.setId === s.id && dragOverSlot === slot && !isDraggingThis

                              return (
                                <div
                                  key={slot}
                                  draggable={!!q}
                                  onDragStart={() => q && handleDragStart(s.id, slot)}
                                  onDragOver={(e) => handleDragOver(e, slot)}
                                  onDragEnd={handleDragEnd}
                                  onDrop={(e) => handleDrop(e, slot, s.id)}
                                  className={`rounded-xl overflow-hidden transition-all ${
                                    isDraggingThis
                                      ? 'opacity-40 scale-[0.98]'
                                      : isDragOver
                                      ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-[#0f0f1a]'
                                      : q ? 'bg-white/5' : 'bg-amber-500/10 border border-dashed border-amber-500/30'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 px-3 py-2.5">
                                    {/* Drag handle */}
                                    <div
                                      className={`flex-shrink-0 flex flex-col gap-0.5 cursor-grab active:cursor-grabbing ${q ? 'opacity-30 hover:opacity-70' : 'opacity-0'}`}
                                      title="Drag to reorder"
                                    >
                                      <span className="block w-3.5 h-0.5 bg-gray-400 rounded-full" />
                                      <span className="block w-3.5 h-0.5 bg-gray-400 rounded-full" />
                                      <span className="block w-3.5 h-0.5 bg-gray-400 rounded-full" />
                                    </div>
                                    <span className="text-xs font-bold text-gray-400 w-5 text-center flex-shrink-0">{slot}</span>
                                    {q ? (
                                      <>
                                        <button
                                          className="flex-1 min-w-0 text-left"
                                          onClick={() => toggleQDetail(q.question_id)}
                                        >
                                          <p className="text-sm text-white font-medium leading-snug">{q.prompt}</p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-gray-400">{q.category}</span>
                                            {usedElsewhere && (
                                              <span className="text-xs font-semibold text-amber-600">⚠ also in another set</span>
                                            )}
                                          </div>
                                        </button>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${diffBadge(q.difficulty)}`}>{q.difficulty}</span>
                                        <button
                                          onClick={() => toggleQDetail(q.question_id)}
                                          className="text-gray-400 hover:text-amber-400 flex-shrink-0 text-xs font-medium"
                                          title={expandedQ === q.question_id ? 'Collapse' : 'View answers'}
                                        >
                                          {expandedQ === q.question_id ? '▲' : '▼'}
                                        </button>
                                        <button
                                          onClick={() => handleRemoveQuestion(q.dsq_id, s.id)}
                                          disabled={removing === q.dsq_id}
                                          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40 text-lg leading-none"
                                          title="Remove from slot"
                                        >×</button>
                                      </>
                                    ) : (
                                      <>
                                        <p className="flex-1 text-xs text-indigo-400 italic">Empty slot</p>
                                        <button
                                          onClick={() => openPicker(s.id, slot)}
                                          className="text-xs bg-amber-500/100 text-white px-3 py-1 rounded-lg hover:bg-amber-600"
                                        >+ Add</button>
                                      </>
                                    )}
                                  </div>

                                  {/* Expanded answer detail */}
                                  {q && expandedQ === q.question_id && (
                                    <div className="border-t border-white/10 px-3 pb-3 pt-2 bg-[#0f0f1a]">
                                      {!qDetails[q.question_id] ? (
                                        <div className="flex justify-center py-3">
                                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-500 border-t-transparent" />
                                        </div>
                                      ) : (
                                        <>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                            {qDetails[q.question_id].options
                                              .sort((a, b) => a.sort_order - b.sort_order)
                                              .map((opt, idx) => {
                                                const isCorrect = opt.id === qDetails[q.question_id].correct_option_id
                                                const letter = ['A', 'B', 'C', 'D'][idx]
                                                return (
                                                  <div
                                                    key={opt.id}
                                                    className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-sm ${
                                                      isCorrect
                                                        ? 'bg-green-500/10 border-green-500/50 text-green-400'
                                                        : 'bg-white/5 border-white/10 text-gray-300'
                                                    }`}
                                                  >
                                                    <span className={`font-bold flex-shrink-0 ${isCorrect ? 'text-green-400' : 'text-gray-400'}`}>
                                                      {letter}{isCorrect ? ' ✓' : ''}
                                                    </span>
                                                    <span>{opt.text}</span>
                                                  </div>
                                                )
                                              })}
                                          </div>
                                          {qDetails[q.question_id].explanation && (
                                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-300">
                                              💡 {qDetails[q.question_id].explanation}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Footer actions */}
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            {qCount >= 2 && (
                              <button
                                onClick={() => handleSort(s.id)}
                                disabled={sorting === s.id}
                                className="text-sm font-semibold px-4 py-2 rounded-xl border border-amber-500/30 text-amber-400 hover:bg-amber-500/100/10 disabled:opacity-50 flex items-center gap-1.5"
                              >
                                {sorting === s.id ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-amber-500 border-t-transparent" />
                                    Sorting…
                                  </>
                                ) : (
                                  '📶 Sort Easiest → Hardest'
                                )}
                              </button>
                            )}
                            <p className="text-xs text-gray-400">
                              {qCount < SLOT_COUNT
                                ? `${SLOT_COUNT - qCount} slot${SLOT_COUNT - qCount !== 1 ? 's' : ''} still empty — cannot publish until all ${SLOT_COUNT} are filled.`
                                : `All ${SLOT_COUNT} slots filled. Ready to publish.`}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Bulk delete upcoming drafts */}
        {sets.some(s => s.set_date > new Date().toISOString().slice(0, 10) && !s.is_published) && (
          <div className="mt-6 border border-red-100 rounded-2xl px-5 py-4 bg-red-500/10">
            {confirmDeleteAll ? (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-red-400 font-semibold flex-1">
                  Delete all upcoming draft sets? This cannot be undone.
                </p>
                <button
                  onClick={handleDeleteAllUpcoming}
                  disabled={deletingAll}
                  className="text-sm bg-red-600 text-white font-semibold px-4 py-2 rounded-xl hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingAll ? 'Deleting…' : 'Yes, delete all'}
                </button>
                <button
                  onClick={() => setConfirmDeleteAll(false)}
                  className="text-sm border border-red-500/30 text-red-500 px-4 py-2 rounded-xl hover:bg-red-500/10"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-red-400">
                  Remove all upcoming draft sets so you can regenerate them fresh.
                </p>
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  className="text-sm border border-red-500/30 text-red-400 font-semibold px-4 py-2 rounded-xl hover:bg-red-500/10 whitespace-nowrap"
                >
                  🗑 Delete all upcoming drafts
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Question picker modal */}
      {pickerFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white/5 rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
              <div>
                <h3 className="font-bold text-white">Pick a question — Slot {pickerFor.slot}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {pickerFor.slot <= 3 ? 'Slot 1–3: aim for easier questions (Initiate–Challenger)' :
                   pickerFor.slot <= 6 ? 'Slot 4–6: medium difficulty (Decoder–Theorist)' :
                                         'Slot 7–10: harder questions (Cryptic Mind–The Oracle)'}
                </p>
              </div>
              <button onClick={closePicker} className="text-gray-400 hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <div className="px-5 py-3 border-b border-white/10 space-y-2">
              <input
                type="text"
                placeholder="Search questions…"
                value={pickerSearch}
                onChange={e => onPickerSearchChange(e.target.value)}
                autoFocus
                className="w-full border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideUsed}
                  onChange={e => setHideUsed(e.target.checked)}
                  className="accent-indigo-600"
                />
                Hide previously used questions
              </label>
            </div>
            <div className="overflow-y-auto flex-1 px-2 py-2">
              {pickerLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-4 border-amber-500 border-t-transparent" />
                </div>
              ) : (
                (() => {
                  const alreadyInSet = new Set((setQuestions[pickerFor.setId] ?? []).map(q => q.question_id))
                  const filtered = pickerResults.filter(q => {
                    if (alreadyInSet.has(q.id)) return false
                    if (hideUsed && usageMap[q.id]) return false
                    return true
                  })

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-gray-400 text-sm">No questions found.</p>
                        {hideUsed && (
                          <button onClick={() => setHideUsed(false)} className="text-xs text-amber-400 mt-2 hover:underline">
                            Show used questions
                          </button>
                        )}
                      </div>
                    )
                  }

                  return filtered.map(q => {
                    const usage = usageMap[q.id]
                    const tier = q.correct_rate !== null ? tierFromRate(q.correct_rate) : null
                    const tierInfo = getTierInfo(tier)

                    return (
                      <button
                        key={q.id}
                        onClick={() => handleAddQuestion(q)}
                        disabled={adding === q.id}
                        className="w-full text-left px-3 py-3 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        <p className="text-sm text-white font-medium line-clamp-2">{q.prompt}</p>
                        <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                          {tier !== null && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${tierInfo.color} ${tierInfo.textColor} ${tierInfo.borderColor}`}>
                              {tierInfo.shortName}
                            </span>
                          )}
                          {tier === null && (
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-white/10 text-gray-400 border-white/10">
                              Not yet on {EINSTEIN_SCALE_NAME}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{q.category_name}</span>
                          {usage && <UsageBadge usage={usage} />}
                          {adding === q.id && <span className="text-xs text-amber-400">Adding…</span>}
                        </div>
                      </button>
                    )
                  })
                })()
              )}
            </div>
          </div>
        </div>
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

