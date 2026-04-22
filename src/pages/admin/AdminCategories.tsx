import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Category } from '../../types'

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [{ data: cats, error: catErr }, { data: qRows }] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('questions').select('category_id'),
    ])
    if (catErr) setError(catErr.message)
    else setCategories(cats ?? [])

    // Build count map from question rows
    const counts: Record<string, number> = {}
    for (const q of qRows ?? []) {
      if (q.category_id) counts[q.category_id] = (counts[q.category_id] ?? 0) + 1
    }
    setQuestionCounts(counts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    setError(null)
    const { error } = await supabase.from('categories').insert({
      name: newName.trim(),
      slug: slugify(newName.trim()),
      is_active: true,
    })
    if (error) setError(error.message)
    else { setNewName(''); await load() }
    setAdding(false)
  }

  async function handleToggleActive(cat: Category) {
    await supabase.from('categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    await load()
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return
    const { error } = await supabase.from('categories')
      .update({ name: editName.trim(), slug: slugify(editName.trim()) })
      .eq('id', id)
    if (error) setError(error.message)
    else { setEditingId(null); await load() }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this category? Questions using it will lose their category.')) return
    await supabase.from('categories').delete().eq('id', id)
    await load()
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/admin" className="text-gray-400 hover:text-gray-300 text-sm">← Admin</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold text-white">Categories</h1>
        </div>

        {/* Add new */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-200 mb-3">Add Category</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. Science & Nature"
              className="flex-1 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="bg-amber-500/100 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-amber-600 disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {categories.length === 0 && (
              <p className="text-center text-gray-400 py-12 text-sm">No categories yet.</p>
            )}
            {categories.map((cat, i) => (
              <div
                key={cat.id}
                className={`flex items-center gap-4 px-5 py-4 ${i < categories.length - 1 ? 'border-b border-white/5' : ''}`}
              >
                {/* Active toggle */}
                <button
                  onClick={() => handleToggleActive(cat)}
                  className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${cat.is_active ? 'bg-green-400' : 'bg-gray-200'}`}
                  title={cat.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cat.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>

                {/* Name / edit */}
                <div className="flex-1 min-w-0">
                  {editingId === cat.id ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(cat.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="flex-1 border border-amber-500/40 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <button onClick={() => handleSaveEdit(cat.id)} className="text-xs text-amber-400 font-semibold">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">Cancel</button>
                    </div>
                  ) : (
                    <Link to={`/admin/categories/${cat.id}/questions`} className="block group">
                      <p className={`font-medium text-sm group-hover:text-amber-400 transition-colors ${cat.is_active ? 'text-white' : 'text-gray-400'}`}>{cat.name}</p>
                      <p className="text-xs text-gray-500">{cat.slug}</p>
                    </Link>
                  )}
                </div>

                {/* Question count badge */}
                {editingId !== cat.id && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-gray-300 flex-shrink-0 tabular-nums">
                    {(questionCounts[cat.id] ?? 0).toLocaleString()} {questionCounts[cat.id] === 1 ? 'question' : 'questions'}
                  </span>
                )}

                {/* Actions */}
                {editingId !== cat.id && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setEditingId(cat.id); setEditName(cat.name) }}
                      className="text-xs text-gray-400 hover:text-amber-400 px-2 py-1 rounded hover:bg-amber-500/100/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="text-xs text-gray-400 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
