import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  adminGetDailySets,
  adminCreateDailySet,
  adminUpdateDailySet,
  adminGetSetQuestions,
  adminAddQuestionToSet,
  adminRemoveQuestionFromSet,
  type AdminDailySet,
  type AdminSetQuestion,
} from '../../lib/api'

const SLOT_COUNT = 10

type PickerQuestion = {
  id: string
  prompt: string
  difficulty: string
  category_name: string
}

export default function AdminDailySet() {
  const [sets, setSets] = useState<AdminDailySet[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [setQuestions, setSetQuestions] = useState<Record<string, AdminSetQuestion[]>>({})
  const [loadingQs, setLoadingQs] = useState<string | null>(null)

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

  // Removing a question from a slot
  const [removing, setRemoving] = useState<string | null>(null)

  // Question picker modal
  const [pickerFor, setPickerFor] = useState<{ setId: string; slot: number } | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerResults, setPickerResults] = useState<PickerQuestion[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Toast
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { load() }, [])

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
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed'}`)
    } finally {
      setRemoving(null)
    }
  }

  // ── Question picker ──────────────────────────────────────────────────────────

  function openPicker(setId: string, slot: number) {
    setPickerFor({ setId, slot })
    setPickerSearch('')
    setPickerResults([])
    searchPicker('')
  }

  function closePicker() {
    setPickerFor(null)
    setPickerSearch('')
    setPickerResults([])
    if (searchTimer.current) clearTimeout(searchTimer.current)
  }

  function onPickerSearchChange(val: string) {
    setPickerSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchPicker(val), 300)
  }

  async function searchPicker(q: string) {
    setPickerLoading(true)
    try {
      let query = supabase
        .from('questions')
        .select('id, prompt, difficulty, categories ( name )')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30)
      if (q.trim()) query = query.ilike('prompt', `%${q.trim()}%`)
      const { data, error } = await query
      if (error) throw error
      setPickerResults((data ?? []).map((r: any) => ({
        id: r.id,
        prompt: r.prompt,
        difficulty: r.difficulty,
        category_name: r.categories?.name ?? '—',
      })))
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
      closePicker()
      showToast(`✓ Question added to slot ${slot}.`)
    } catch (err: any) {
      showToast(`✗ ${err?.message ?? 'Failed to add'}`)
    } finally {
      setAdding(null)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const diffBadge = (d: string) =>
    d === 'easy'   ? 'bg-green-100 text-green-700' :
    d === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                     'bg-red-100 text-red-700'

  // Build slot map for expanded set
  function slotMap(setId: string): Record<number, AdminSetQuestion | undefined> {
    const result: Record<number, AdminSetQuestion | undefined> = {}
    for (let i = 1; i <= SLOT_COUNT; i++) result[i] = undefined
    for (const q of (setQuestions[setId] ?? [])) result[q.slot] = q
    return result
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Daily Sets</h1>
          <button
            onClick={() => { setShowNew(true); setCreateError(null) }}
            className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700"
          >
            + New Set
          </button>
        </div>
        <p className="text-gray-500 mb-8">Schedule 10-question sets for specific dates. Publish to make them live.</p>

        {/* New set form */}
        {showNew && (
          <div className="bg-white border border-indigo-100 rounded-2xl p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">New Daily Set</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Date *</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Title (optional)</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Science Special"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            {createError && <p className="text-sm text-red-500 mb-3">{createError}</p>}
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating}
                className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                {creating ? 'Creating…' : 'Create Set'}
              </button>
              <button onClick={() => setShowNew(false)}
                className="border border-gray-200 text-gray-600 text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Sets list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : sets.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl px-6 py-16 text-center">
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
                <div key={s.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    <button
                      onClick={() => expand(s.id)}
                      className="flex-1 text-left flex items-center gap-4 min-w-0"
                    >
                      <div className="flex-shrink-0 text-center">
                        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
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
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(s); if (e.key === 'Escape') setEditingTitle(prev => { const n = { ...prev }; delete n[s.id]; return n }) }}
                            autoFocus
                            className="border border-indigo-300 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        ) : (
                          <p className="font-semibold text-gray-900 text-sm truncate">
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
                      {isEditingTitle ? (
                        <>
                          <button onClick={() => handleSaveTitle(s)} disabled={savingSet === s.id}
                            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                            {savingSet === s.id ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingTitle(prev => { const n = { ...prev }; delete n[s.id]; return n })}
                            className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setEditingTitle(prev => ({ ...prev, [s.id]: s.title ?? '' }))}
                          className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                          ✏ Edit title
                        </button>
                      )}
                      <button
                        onClick={() => handleTogglePublish(s)}
                        disabled={togglingPublish === s.id}
                        title={s.is_published ? 'Unpublish' : 'Publish'}
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none disabled:opacity-40 ${s.is_published ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                        <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${s.is_published ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.is_published ? 'Live' : 'Draft'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded: slots */}
                  {isOpen && (
                    <div className="border-t border-gray-100 px-5 py-4">
                      {loadingQs === s.id ? (
                        <div className="flex justify-center py-6">
                          <div className="animate-spin rounded-full h-6 w-6 border-4 border-indigo-600 border-t-transparent" />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map(slot => {
                            const q = slots[slot]
                            return (
                              <div key={slot} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${q ? 'bg-gray-50' : 'bg-indigo-50 border border-dashed border-indigo-200'}`}>
                                <span className="text-xs font-bold text-gray-400 w-5 text-center flex-shrink-0">{slot}</span>
                                {q ? (
                                  <>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-gray-900 font-medium truncate" title={q.prompt}>{q.prompt}</p>
                                      <p className="text-xs text-gray-400 mt-0.5">{q.category}</p>
                                    </div>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${diffBadge(q.difficulty)}`}>{q.difficulty}</span>
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
                                      className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700"
                                    >+ Add</button>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {!loadingQs && qCount < SLOT_COUNT && (
                        <p className="text-xs text-amber-600 mt-3">
                          ⚠ {SLOT_COUNT - qCount} slot{SLOT_COUNT - qCount !== 1 ? 's' : ''} still empty — set cannot be published until all {SLOT_COUNT} are filled.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Question picker modal */}
      {pickerFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Pick a question — Slot {pickerFor.slot}</h3>
              <button onClick={closePicker} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Search questions…"
                value={pickerSearch}
                onChange={e => onPickerSearchChange(e.target.value)}
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="overflow-y-auto flex-1 px-2 py-2">
              {pickerLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-4 border-indigo-600 border-t-transparent" />
                </div>
              ) : pickerResults.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No questions found.</p>
              ) : (
                pickerResults.map(q => {
                  // Skip questions already in this set
                  const alreadyIn = (setQuestions[pickerFor.setId] ?? []).some(sq => sq.question_id === q.id)
                  return (
                    <button
                      key={q.id}
                      onClick={() => handleAddQuestion(q)}
                      disabled={alreadyIn || adding === q.id}
                      className="w-full text-left px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <p className="text-sm text-gray-900 font-medium line-clamp-2">{q.prompt}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${diffBadge(q.difficulty)}`}>{q.difficulty}</span>
                        <span className="text-xs text-gray-400">{q.category_name}</span>
                        {alreadyIn && <span className="text-xs text-gray-400 italic">already in set</span>}
                        {adding === q.id && <span className="text-xs text-indigo-500">Adding…</span>}
                      </div>
                    </button>
                  )
                })
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
