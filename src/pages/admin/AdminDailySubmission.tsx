import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adminGetSubmissionQueue,
  adminUpdateSubmission,
  adminDeleteSubmission,
  adminFeatureSubmissionNow,
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
    const label = s.status === 'featured' ? 'today\'s live submission' : 'this queued submission'
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

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const featured = items.find(i => i.status === 'featured')
  const queue = items.filter(i => i.status === 'approved')

  // Next auto-rotate: tomorrow at 6am EST
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextRotate = tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6">
          ← Admin
        </Link>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Daily Submission</h1>
          <span className="text-xs bg-indigo-50 text-indigo-600 font-semibold px-3 py-1.5 rounded-full">
            🕕 Auto-rotates daily at 6 AM EST
          </span>
        </div>
        <p className="text-gray-500 mb-10">
          Manage the community trivia question shown on the home page. Accepted submissions auto-queue; the next in line goes live at 6 AM EST.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="bg-white border border-red-100 rounded-2xl p-8 text-center">
            <p className="text-red-500 text-sm mb-3">{error}</p>
            <button onClick={load} className="text-sm text-indigo-600 hover:underline">Retry</button>
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
                  badge={<span className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full">● Live</span>}
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
                <div className="bg-white border border-dashed border-gray-200 rounded-2xl px-6 py-10 text-center">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-gray-500 text-sm">No submission featured for today.</p>
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
                {queue.length > 0 && (
                  <span className="text-xs text-gray-400">Next up: {nextRotate} at 6 AM EST</span>
                )}
              </div>

              {queue.length === 0 ? (
                <div className="bg-white border border-dashed border-gray-200 rounded-2xl px-6 py-10 text-center">
                  <div className="text-3xl mb-2">🪣</div>
                  <p className="text-gray-500 text-sm">Queue is empty. Accept submissions to add them.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queue.map((s, i) => (
                    <SubmissionCard
                      key={s.id}
                      s={s}
                      badge={
                        <span className="text-xs bg-gray-100 text-gray-500 font-semibold px-2.5 py-1 rounded-full">
                          #{i + 1} in queue
                        </span>
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
                  ))}
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
  s, badge, isEditing, editState, onEditChange,
  onEdit, onCancelEdit, onSave, saving, acting,
  onDelete, showFeatureNow, onFeatureNow,
}: CardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="px-5 py-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{s.prompt}</p>
          <p className="text-xs text-gray-400 mt-0.5">by @{s.username} · submitted {new Date(s.created_at).toLocaleDateString()}</p>
        </div>
        {badge}
      </div>

      {isEditing && editState ? (
        /* ── Edit form ──────────────────────────────────────────── */
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Question</label>
            <textarea
              rows={3}
              value={editState.prompt}
              onChange={e => onEditChange({ ...editState, prompt: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {OPTIONS.map(opt => (
              <div key={opt}>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">{opt}</label>
                <input
                  type="text"
                  value={editState[`option_${opt}` as keyof EditState]}
                  onChange={e => onEditChange({ ...editState, [`option_${opt}`]: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Correct Answer</label>
            <select
              value={editState.correct_option}
              onChange={e => onEditChange({ ...editState, correct_option: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {OPTIONS.map(opt => (
                <option key={opt} value={opt}>Option {opt.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Explanation (optional)</label>
            <textarea
              rows={2}
              value={editState.explanation}
              onChange={e => onEditChange({ ...editState, explanation: e.target.value })}
              placeholder="Why is this the correct answer?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onSave}
              disabled={saving}
              className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={onCancelEdit}
              disabled={saving}
              className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── Read view ──────────────────────────────────────────── */
        <div className="border-t border-gray-100 px-5 pb-4 pt-3">
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
                      ? 'border-green-400 bg-green-50 text-green-800 font-semibold'
                      : 'border-gray-100 text-gray-600'
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
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4">
              💡 {s.explanation}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onEdit}
              disabled={acting}
              className="text-sm border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 disabled:opacity-40"
            >
              ✏️ Edit
            </button>

            {showFeatureNow && onFeatureNow && (
              <button
                onClick={onFeatureNow}
                disabled={acting}
                className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-40"
              >
                {acting ? 'Featuring…' : '⚡ Feature Now'}
              </button>
            )}

            <button
              onClick={onDelete}
              disabled={acting}
              className="text-sm border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-40 ml-auto"
            >
              {acting ? 'Deleting…' : '🗑 Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
