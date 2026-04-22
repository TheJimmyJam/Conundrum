import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCategories, createGameSession, getEndlessPersonalBests, type EndlessPersonalBest } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import type { Category } from '../types'

type Difficulty = 'easy' | 'medium' | 'hard'

const DIFFICULTIES: { key: Difficulty; label: string; color: string; active: string }[] = [
  { key: 'easy',   label: 'Easy',   color: 'border-green-300 text-green-700 bg-green-50',  active: 'bg-green-500 text-white border-green-500' },
  { key: 'medium', label: 'Medium', color: 'border-yellow-300 text-yellow-700 bg-yellow-50', active: 'bg-yellow-500 text-white border-yellow-500' },
  { key: 'hard',   label: 'Hard',   color: 'border-red-300 text-red-700 bg-red-50',   active: 'bg-red-500 text-white border-red-500' },
]

export default function EndlessHubPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { setSession, reset } = useGameStore()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [bests, setBests] = useState<Record<string, EndlessPersonalBest>>({})

  // Difficulty filter — all selected by default
  const [selectedDiffs, setSelectedDiffs] = useState<Set<Difficulty>>(
    new Set(['easy', 'medium', 'hard'])
  )

  useEffect(() => {
    getCategories().then((cats) => { setCategories(cats); setLoading(false) })
    if (user) {
      getEndlessPersonalBests()
        .then(rows => {
          const map: Record<string, EndlessPersonalBest> = {}
          rows.forEach(r => { map[r.category_id ?? 'random'] = r })
          setBests(map)
        })
        .catch(() => {})
    }
  }, [user])

  function toggleDiff(d: Difficulty) {
    setSelectedDiffs(prev => {
      const next = new Set(prev)
      if (next.has(d)) {
        // Don't allow deselecting all
        if (next.size === 1) return prev
        next.delete(d)
      } else {
        next.add(d)
      }
      return next
    })
  }

  const difficultyFilter = selectedDiffs.size === 3
    ? null  // all selected = no filter needed
    : Array.from(selectedDiffs)

  async function startSession(categoryId: string | null) {
    if (!user) return
    setStarting(categoryId ?? 'random')
    reset()
    const session = await createGameSession(user.id, null, 'endless', categoryId, difficultyFilter)
    setSession(session.id, 'endless')
    navigate('/endless/play', { state: { sessionId: session.id, categoryId } })
  }

  const allSelected = selectedDiffs.size === 3

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Endless Mode</h1>
        <p className="text-gray-400 mb-8">Play any time. Pick a category or go random.</p>

        {/* Difficulty selector */}
        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 mb-8">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-semibold text-gray-300 shrink-0">Difficulty:</span>
            <div className="flex gap-2">
              {DIFFICULTIES.map(({ key, label, color, active }) => {
                const isOn = selectedDiffs.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleDiff(key)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all select-none ${isOn ? active : color}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {!allSelected && (
              <button
                onClick={() => setSelectedDiffs(new Set(['easy', 'medium', 'hard']))}
                className="text-xs text-gray-400 hover:text-gray-300 underline ml-auto"
              >
                Reset to all
              </button>
            )}
          </div>
          {!allSelected && (
            <p className="text-xs text-gray-400 mt-2 ml-0">
              Questions will be filtered to: {Array.from(selectedDiffs).join(', ')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Random card */}
          <button
            onClick={() => startSession(null)}
            disabled={!!starting}
            className="col-span-2 md:col-span-1 bg-amber-500 text-white rounded-2xl p-6 text-left hover:bg-amber-600 transition-colors disabled:opacity-50 shadow-sm flex flex-col"
          >
            <div className="text-3xl mb-3">🎲</div>
            <h3 className="font-bold text-lg mb-1">Random</h3>
            <p className="text-amber-200 text-sm mb-auto">Questions from all categories mixed together</p>
            <PersonalBestBadge best={bests['random']} light />
            {starting === 'random' && <p className="text-amber-200 text-xs mt-2">Starting…</p>}
          </button>

          {/* Category cards */}
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white/5 rounded-2xl p-6 border border-white/10 animate-pulse h-36 bg-white/5" />
            ))
          ) : (
            categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => startSession(cat.id)}
                disabled={!!starting}
                className="bg-white/5 rounded-2xl p-6 border border-white/10 text-left hover:border-amber-500/40 hover:shadow-sm transition-all disabled:opacity-50 flex flex-col"
              >
                <h3 className="font-bold text-white mb-1">{cat.name}</h3>
                <p className="text-xs text-gray-400 mb-auto">{cat.slug}</p>
                <PersonalBestBadge best={bests[cat.id]} />
                {starting === cat.id && <p className="text-amber-400 text-xs mt-2">Starting…</p>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Personal best badge ───────────────────────────────────────────────────────

function PersonalBestBadge({ best, light }: { best?: EndlessPersonalBest; light?: boolean }) {
  if (!best) return null

  const streakColor = light ? 'text-amber-200' : 'text-amber-400'
  const labelColor  = light ? 'text-amber-300' : 'text-gray-400'

  return (
    <div className={`mt-3 pt-3 border-t ${light ? 'border-indigo-500' : 'border-white/10'} flex items-center gap-3`}>
      <div>
        <p className={`text-xs font-medium ${labelColor}`}>Best streak</p>
        <p className={`text-lg font-bold leading-tight ${streakColor}`}>🔥 {best.best_streak}</p>
      </div>
      <div>
        <p className={`text-xs font-medium ${labelColor}`}>Best score</p>
        <p className={`text-lg font-bold leading-tight ${streakColor}`}>{best.best_score}</p>
      </div>
    </div>
  )
}
