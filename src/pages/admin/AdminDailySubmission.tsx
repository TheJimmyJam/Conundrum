import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminGetSubmissionQueue,
  adminUpdateSubmission,
  adminDeleteSubmission,
  adminFeatureSubmissionNow,
  adminReviewSubmission,
  type QueuedSubmission,
} from '../../lib/api'

const OPTIONS = ['a', 'b', 'c', 'd'] as const

type EditState = {
  prompt: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string
}

function emptyEdit(s: QueuedSubmission): EditState {
  return {
    prompt: s.prompt,
    option_a: s.option_a,
    option_b: s.option_b,
    option_c: s.option_c,
    option_d: s.option_d,
    correct_option: s.correct_option,
    explanation: s.explanation ?? '',
  }
}

export default function AdminDailySubmission() {
  const [items, setItems] = useState<QueuedSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  // Drag-to-reorder state
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setItems(await adminGetSubmissionQueue())
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(s: QueuedSubmission) {
    setEditing(s.id)
    setEditState(emptyEdit(s))
  }

  function cancelEdit() {
    setEditing(null)
    setEditState(null)
  }

  async function saveEdit(id: string) {
    if (!editState) return
    setSaving(true)
    try {
      await adminUpdateSubmission(id, {
        ...editState,
        explanation: editState.explanation || null,
      })
      await load()
      cancelEdit()
    } catch (err: any) {
      alert(err?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: QueuedSubmission) {
    const label = (s.status === 'featured' && s.featured_date === todayISO) ? "today's live submission" : 'this queued submission'
    if (!confirm(`Delete ${label}?\n\n"${s.prompt.slice(0, 80)}…"\n\nIt will be rejected and removed from the queue.`)) return
    setActing(s.id)
    try {
      await adminDeleteSubmission(s.id)
      setItems(prev => prev.filter(i => i.id !== s.id))
    } catch (err: any) {
      alert(err?.message ?? 'Failed to delete')
    } finally {
      setActing(null)
    }
  }

  async function handleFeatureNow(s: QueuedSubmission) {
    if (!confirm(`Feature this question today?\n\n"${s.prompt.slice(0, 80)}"\n\nThis will replace whatever is currently live.`)) return
    setActing(s.id)
    try {
      await adminFeatureSubmissionNow(s.id)
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Failed to feature')
    } finally {
      setActing(null)
    }
  }

  // ── Drag-to-reorder queue ────────────────────────────────────────────────────

  function handleDragStart(idx: number) {
    setDragFromIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  function handleDragEnd() {
    setDragFromIdx(null)
    setDragOverIdx(null)
  }

  async function handleDrop(e: React.DragEvent, toIdx: number, currentQueue: QueuedSubmission[]) {
    e.preventDefault()
    if (dragFromIdx === null || dragFromIdx === toIdx) { handleDragEnd(); return }

    // Shift-style reorder
    const newQueue = [...currentQueue]
    const [moved] = newQueue.splice(dragFromIdx, 1)
    newQueue.splice(toIdx, 0, moved)

    // Redistribute original featured_dates across new positions
    const originalDates = currentQueue.map(item => item.featured_date)
    const updatedQueue = newQueue.map((item, i) => ({ ...item, featured_date: originalDates[i] }))

    // Optimistic update — splice updated queue back into items
    setItems(prev => {
      const featuredItem = prev.find(x => x.status === 'featured' && x.featured_date === todayISO)
      return [...(featuredItem ? [featuredItem] : []), ...updatedQueue]
    })
    handleDragEnd()

    // Persist date changes for items whose date shifted
    setReordering(true)
    try {
      await Promise.all(
        updatedQueue
          .filter((item, i) => {
            const orig = currentQueue.find(q => q.id === item.id)
            return orig && orig.featured_date !== item.featured_date
          })
          .map(item =>
            adminReviewSubmission(item.id, item.featured_date ? 'featured' : 'approved', item.featured_date ?? undefined)
          )
      )
    } catch (err: any) {
      // Rollback
      await load()
    } finally {
      setReordering(false)
    }
  }

  const todayISO = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Today's live = featured with today's date
  const featured = items.find(i => i.status === 'featured' && i.featured_date === todayISO)
  // Queue = everything else: future-dated featured + undated approved
  const queue = items.filter(i => !(i.status === 'featured' && i.featured_date === todayISO))

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 mb-6">
          ← Admin
        </Link>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-white">Daily Submission</h1>
          <span className="text-xs bg-amber-500/100/10 text-amber-400 font-semibold px-3 py-1.5 rounded-full">
            🕕 Auto-rotates daily at 6 AM EST
          </span>
        </div>
        <p className="text-gray-400 mb-10">
          Manage the community trivia question shown on the home page. Accepted submissions auto-queue; the next in line goes live at 6 AM EST.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="bg-white border border-red-100 rounded-2xl p-8 text-center">
            <p className="text-red-500 text-sm mb-3">{error}</p>
            <button onClick={load} className="text-sm text-amber-400 hover:underline">Retry</button>
          </div>
        ) : (
          <>
            {/* ── Today's Live Submission ─────────────────────────────── */}
            <section className="mb-10">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
                Live Today — {todayStr}
              </h2>

              {featured ? (
                <SubmissionCard
                  s={featured}
                  badge={<span className="text-xs bg-green-500/100/15 text-green-400 font-semibold px-2.5 py-1 rounded-full">● Live</span>}
                  isEditing={editing === featured.id}
                  editState={editState}
                  onEditChange={setEditState}
                  onEdit={() => startEdit(featured)}
                  onCancelEdit={cancelEdit}
                  onSave={() => saveEdit(featured.id)}
                  saving={saving}
                  acting={acting === featured.id}
                  onDelete={() => handleDelete(featured)}
                  showFeatureNow={false}
                />
              ) : (
                <div className="bg-white border border-dashed border-white/10 rounded-2xl px-6 py-10 text-center">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-gray-400 text-sm">No submission featured for today.</p>
                  {queue.length > 0 && (
                    <p className="text-gray-400 text-xs mt-1">The next item in the queue will go live at 6 AM EST, or use "Feature Now" below.</p>
                  )}
                </div>
              )}
            </section>

            {/* ── Queue ───────────────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
                  Queue — {queue.length} upcoming
                </h2>
              </div>

              {queue.length === 0 ? (
                <div className="bg-white/5 border border-dashed border-white/10 rounded-2xl px-6 py-10 text-center">
                  <div className="text-3xl mb-2">🪣</div>
                  <p className="text-gray-400 text-sm">Queue is empty.</p>
                  <p className="text-gray-400 text-xs mt-1">Go to <strong>Question Submissions</strong>, approve a question, then hit <strong>Add to Queue</strong>.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reordering && (
                    <p className="text-xs text-amber-400 flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                      Saving new order…
                    </p>
                  )}
                  {queue.map((s, i) => {
                    const dateBadge = s.featured_date
                      ? new Date(s.featured_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                      : null
                    const isDraggingThis = dragFromIdx === i
                    const isDragOver = dragOverIdx === i && dragFromIdx !== i
                    return (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, i, queue)}
                        className={`transition-all ${
                          isDraggingThis ? 'opacity-40 scale-[0.98]' :
                          isDragOver ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#0f0f1a] rounded-2xl' : ''
                        }`}
                      >
                        <SubmissionCard
                          s={s}
                          badge={
                            dateBadge ? (
                              <span className="text-xs bg-amber-500/15 text-amber-400 font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                                📅 {dateBadge}
                              </span>
                            ) : (
                              <span className="text-xs bg-white/10 text-gray-400 font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                                #{i + 1} in queue
                              </span>
                            )
                          }
                          dragHandle={
                            <div className="flex flex-col gap-0.5 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-70 flex-shrink-0 px-1 py-0.5" title="Drag to reorder">
                              <span className="block w-3.5 h-0.5 bg-gray-400 rounded-full" />
                              <span className="block w-3.5 h-0.5 bg-gray-400 rounded-full" />
                              <span className="block w-3.5 h-0.5 bg-gray-400 rounded-full" />
                            </div>
                          }
                          isEditing={editing === s.id}
                          editState={editState}
                          onEditChange={setEditState}
                          onEdit={() => startEdit(s)}
                          onCancelEdit={cancelEdit}
                          onSave={() => saveEdit(s.id)}
                          saving={saving}
                          acting={acting === s.id}
                          onDelete={() => handleDelete(s)}
                          showFeatureNow
                          onFeatureNow={() => handleFeatureNow(s)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ── SubmissionCard ─────────────────────────────────────────────────────────────

type CardProps = {
  s: QueuedSubmission
  badge: React.ReactNode
  dragHandle?: React.ReactNode
  isEditing: boolean
  editState: EditState | null
  onEditChange: (s: EditState) => void
  onEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  saving: boolean
  acting: boolean
  onDelete: () => void
  showFeatureNow: boolean
  onFeatureNow?: () => void
}

function SubmissionCard({
  s, badge, dragHandle, isEditing, editState, onEditChange,
  onEdit, onCancelEdit, onSave, saving, acting,
  onDelete, showFeatureNow, onFeatureNow,
}: CardProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="px-5 py-4 flex items-center gap-3">
        {dragHandle}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{s.prompt}</p>
          <p className="text-xs text-gray-400 mt-0.5">by @{s.username} · submitted {new Date(s.created_at).toLocaleDateString()}</p>
        </div>
        {badge}
      </div>

      {isEditing && editState ? (
        /* ── Edit form ──────────────────────────────────────────── */
        <div className="border-t border-white/10 px-5 pb-5 pt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Question</label>
            <textarea
              rows={3}
              value={editState.prompt}
              onChange={e => onEditChange({ ...editState, prompt: e.target.value })}
              className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {OPTIONS.map(opt => (
              <div key={opt}>
                <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase">{opt}</label>
                <input
                  type="text"
                  value={editState[`option_${opt}` as keyof EditState]}
                  onChange={e => onEditChange({ ...editState, [`option_${opt}`]: e.target.value })}
                  className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Correct Answer</label>
            <select
              value={editState.correct_option}
              onChange={e => onEditChange({ ...editState, correct_option: e.target.value })}
              className="border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {OPTIONS.map(opt => (
                <option key={opt} value={opt}>Option {opt.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Explanation (optional)</label>
            <textarea
              rows={2}
              value={editState.explanation}
              onChange={e => onEditChange({ ...editState, explanation: e.target.value })}
              placeholder="Why is this the correct answer?"
              className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onSave}
              disabled={saving}
              className="bg-amber-500/100 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={onCancelEdit}
              disabled={saving}
              className="border border-white/10 text-gray-300 text-sm px-4 py-2 rounded-lg hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── Read view ──────────────────────────────────────────── */
        <div className="border-t border-white/10 px-5 pb-4 pt-3">
          {/* Options preview */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {OPTIONS.map(opt => {
              const text = s[`option_${opt}` as keyof QueuedSubmission] as string
              const isCorrect = s.correct_option === opt
              return (
                <div
                  key={opt}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                    isCorrect
                      ? 'border-green-400 bg-green-500/10 text-green-800 font-semibold'
                      : 'border-white/10 text-gray-300'
                  }`}
                >
                  <span className="font-bold uppercase w-3">{opt}</span>
                  <span className="truncate">{text}</span>
                  {isCorrect && <span className="ml-auto">✓</span>}
                </div>
              )
            })}
          </div>

          {s.explanation && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mb-4">
              💡 {s.explanation}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onEdit}
              disabled={acting}
              className="text-sm border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-lg hover:bg-amber-500/100/10 disabled:opacity-40"
            >
              ✏️ Edit
            </button>

            {showFeatureNow && onFeatureNow && (
              <button
                onClick={onFeatureNow}
                disabled={acting}
                className="text-sm bg-amber-500/100 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-40"
              >
                {acting ? 'Featuring…' : '⚡ Feature Now'}
              </button>
            )}

            <button
              onClick={onDelete}
              disabled={acting}
              className="text-sm border border-red-500/30 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-40 ml-auto"
            >
              {acting ? 'Deleting…' : '🗑 Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
