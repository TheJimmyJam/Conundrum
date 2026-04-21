import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Category } from '../../types'

const PAGE_SIZE = 50
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

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

export default function AdminQuestions() {
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

  useEffect(() => {
    supabase.from('categories').select('*').order('name')
      .then(({ data }) => setCategories((data ?? []) as Category[]))
  }, [])

  useEffect(() => { setPage(0) }, [search, categoryFilter, diffFilter, activeFilter])

  useEffect(() => { load() }, [page, search, categoryFilter, diffFilter, activeFilter])

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

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const diffBadge = (d: string) =>
    d === 'easy'   ? 'bg-green-100 text-green-700' :
    d === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                     'bg-red-100 text-red-700'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Questions</h1>
          <button
            onClick={() => { setShowAdd(true); setSaveError(null) }}
            className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700"
          >
            + Add Question
          </button>
        </div>
        <p className="text-gray-500 mb-8">{total.toLocaleString()} questions total. Use Categories → a category for bulk editing.</p>

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
      </div>
    </div>
  )
}
