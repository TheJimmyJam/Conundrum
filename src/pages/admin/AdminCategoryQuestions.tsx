import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const PAGE_SIZE = 50

type Question = {
  id: string
  prompt: string
  difficulty: string
  created_at: string
}

type Option = {
  id: string
  option_text: string
  sort_order: number
}

type ExpandedData = {
  options: Option[]
  correct_option_id: string | null
}

type EditState = {
  prompt: string
  options: { id: string; text: string }[]
  correctId: string | null
}

export default function AdminCategoryQuestions() {
  const { categoryId } = useParams<{ categoryId: string }>()

  const [categoryName, setCategoryName] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, ExpandedData | null>>({})
  const [loadingExpand, setLoadingExpand] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, EditState | null>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<Record<string, string>>({})

  useEffect(() => {
    if (categoryId) {
      supabase.from('categories').select('name').eq('id', categoryId).single()
        .then(({ data }) => setCategoryName(data?.name ?? 'Category'))
    }
  }, [categoryId])

  useEffect(() => {
    load()
  }, [categoryId, page])

  async function load() {
    setLoading(true)
    setExpanded({})
    setEditing({})

    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error, count } = await supabase
      .from('questions')
      .select('id, prompt, difficulty, created_at', { count: 'exact' })
      .eq('category_id', categoryId!)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!error) {
      setQuestions(data ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }

  async function handleExpand(qId: string) {
    // Collapse if already open
    if (expanded[qId] !== undefined) {
      setExpanded(prev => {
        const next = { ...prev }
        delete next[qId]
        return next
      })
      setEditing(prev => {
        const next = { ...prev }
        delete next[qId]
        return next
      })
      return
    }

    setLoadingExpand(qId)

    const [{ data: opts }, { data: ans }] = await Promise.all([
      supabase
        .from('question_options')
        .select('id, option_text, sort_order')
        .eq('question_id', qId)
        .order('sort_order'),
      supabase
        .from('question_answers')
        .select('correct_option_id')
        .eq('question_id', qId)
        .maybeSingle(),
    ])

    setExpanded(prev => ({
      ...prev,
      [qId]: {
        options: opts ?? [],
        correct_option_id: ans?.correct_option_id ?? null,
      },
    }))
    setLoadingExpand(null)
  }

  function startEditing(qId: string) {
    const data = expanded[qId]
    if (!data) return
    const q = questions.find(q => q.id === qId)
    if (!q) return
    setEditing(prev => ({
      ...prev,
      [qId]: {
        prompt: q.prompt,
        options: data.options.map(o => ({ id: o.id, text: o.option_text })),
        correctId: data.correct_option_id,
      },
    }))
    setSaveError(prev => { const n = { ...prev }; delete n[qId]; return n })
  }

  function cancelEditing(qId: string) {
    setEditing(prev => {
      const next = { ...prev }
      delete next[qId]
      return next
    })
    setSaveError(prev => { const n = { ...prev }; delete n[qId]; return n })
  }

  async function handleSave(qId: string) {
    const edit = editing[qId]
    if (!edit) return
    setSaving(qId)
    setSaveError(prev => { const n = { ...prev }; delete n[qId]; return n })

    try {
      // 1. Update prompt
      const { error: qErr } = await supabase
        .from('questions')
        .update({ prompt: edit.prompt.trim() })
        .eq('id', qId)
      if (qErr) throw new Error(qErr.message)

      // 2. Update each option text
      for (const opt of edit.options) {
        const { error: oErr } = await supabase
          .from('question_options')
          .update({ option_text: opt.text.trim() })
          .eq('id', opt.id)
        if (oErr) throw new Error(oErr.message)
      }

      // 3. Update correct answer if changed
      const current = expanded[qId]
      if (edit.correctId && edit.correctId !== current?.correct_option_id) {
        const { error: aErr } = await supabase
          .from('question_answers')
          .update({ correct_option_id: edit.correctId })
          .eq('question_id', qId)
        if (aErr) throw new Error(aErr.message)
      }

      // 4. Update local state
      setQuestions(prev => prev.map(q =>
        q.id === qId ? { ...q, prompt: edit.prompt.trim() } : q
      ))
      setExpanded(prev => ({
        ...prev,
        [qId]: {
          options: edit.options.map((o, i) => ({
            id: o.id,
            option_text: o.text.trim(),
            sort_order: i,
          })),
          correct_option_id: edit.correctId,
        },
      }))
      cancelEditing(qId)
    } catch (err: any) {
      setSaveError(prev => ({ ...prev, [qId]: err.message ?? 'Save failed' }))
    } finally {
      setSaving(null)
    }
  }

  async function handleDelete(qId: string) {
    if (!confirm('Delete this question? This cannot be undone.')) return
    await supabase.from('questions').delete().eq('id', qId)
    setQuestions(prev => prev.filter(q => q.id !== qId))
    setTotal(prev => prev - 1)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const diffColor = (d: string) => {
    if (d === 'easy') return 'bg-green-100 text-green-700'
    if (d === 'hard') return 'bg-red-100 text-red-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link to="/admin/categories" className="text-gray-400 hover:text-gray-600 text-sm">← Categories</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold text-gray-900">{categoryName}</h1>
        </div>
        <p className="text-sm text-gray-400 mb-8">
          {total.toLocaleString()} question{total !== 1 ? 's' : ''} · Page {page + 1} of {totalPages || 1}
        </p>

        {/* Questions list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No questions in this category yet.</div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-6">
            {questions.map((q, i) => {
              const isExpanded = expanded[q.id] !== undefined
              const data = expanded[q.id]
              const isLoadingThis = loadingExpand === q.id
              const editState = editing[q.id]
              const isEditing = !!editState
              const isSaving = saving === q.id

              return (
                <div key={q.id} className={`border-b border-gray-50 last:border-0 ${isExpanded ? 'bg-indigo-50/40' : ''}`}>
                  {/* Question row */}
                  <div
                    className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => !isEditing && handleExpand(q.id)}
                  >
                    <span className="text-xs text-gray-300 font-mono mt-0.5 w-8 flex-shrink-0 text-right">
                      {page * PAGE_SIZE + i + 1}
                    </span>
                    <p className="flex-1 text-sm text-gray-800 leading-snug">{q.prompt}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${diffColor(q.difficulty)}`}>
                        {q.difficulty}
                      </span>
                      {isLoadingThis ? (
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                      ) : (
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Expanded view */}
                  {isExpanded && data && (
                    <div className="px-5 pb-4 ml-12">
                      {isEditing ? (
                        /* ── EDIT MODE ── */
                        <div className="space-y-3">
                          {/* Prompt */}
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Question</label>
                            <textarea
                              value={editState.prompt}
                              onChange={e => setEditing(prev => ({
                                ...prev,
                                [q.id]: { ...editState, prompt: e.target.value }
                              }))}
                              rows={3}
                              className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                            />
                          </div>

                          {/* Options */}
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                              Answers — click radio to mark correct
                            </label>
                            <div className="space-y-2">
                              {editState.options.map((opt, idx) => {
                                const isCorrect = opt.id === editState.correctId
                                return (
                                  <div
                                    key={opt.id}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                                      isCorrect
                                        ? 'border-green-400 bg-green-50'
                                        : 'border-gray-200 bg-white'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setEditing(prev => ({
                                        ...prev,
                                        [q.id]: { ...editState, correctId: opt.id }
                                      }))}
                                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
                                        isCorrect
                                          ? 'border-green-500 bg-green-500'
                                          : 'border-gray-300 bg-white hover:border-green-400'
                                      }`}
                                      title="Mark as correct"
                                    >
                                      {isCorrect && (
                                        <span className="flex items-center justify-center w-full h-full">
                                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        </span>
                                      )}
                                    </button>
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                      isCorrect ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                      {String.fromCharCode(65 + idx)}
                                    </span>
                                    <input
                                      value={opt.text}
                                      onChange={e => {
                                        const newOpts = editState.options.map((o, oi) =>
                                          oi === idx ? { ...o, text: e.target.value } : o
                                        )
                                        setEditing(prev => ({
                                          ...prev,
                                          [q.id]: { ...editState, options: newOpts }
                                        }))
                                      }}
                                      className="flex-1 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-indigo-300 rounded px-1"
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {saveError[q.id] && (
                            <p className="text-xs text-red-500">{saveError[q.id]}</p>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              onClick={() => handleSave(q.id)}
                              disabled={isSaving}
                              className="bg-indigo-600 text-white text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {isSaving ? 'Saving…' : 'Save changes'}
                            </button>
                            <button
                              onClick={() => cancelEditing(q.id)}
                              disabled={isSaving}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── READ MODE ── */
                        <div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                            {data.options.map((opt, idx) => {
                              const isCorrect = opt.id === data.correct_option_id
                              return (
                                <div
                                  key={opt.id}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                                    isCorrect
                                      ? 'border-green-400 bg-green-50 text-green-800 font-medium'
                                      : 'border-gray-200 bg-white text-gray-600'
                                  }`}
                                >
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                    isCorrect ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    {String.fromCharCode(65 + idx)}
                                  </span>
                                  {opt.option_text}
                                  {isCorrect && <span className="ml-auto text-green-600 text-xs">✓ Correct</span>}
                                </div>
                              )
                            })}
                          </div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={(e) => { e.stopPropagation(); startEditing(q.id) }}
                              className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline"
                            >
                              Edit question
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(q.id) }}
                              className="text-xs text-red-400 hover:text-red-600 hover:underline"
                            >
                              Delete question
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
