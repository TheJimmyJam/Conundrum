import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCategories, createGameSession } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import type { Category } from '../types'

export default function EndlessHubPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { setSession, reset } = useGameStore()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    getCategories().then((cats) => { setCategories(cats); setLoading(false) })
  }, [])

  async function startSession(categoryId: string | null) {
    if (!user) return
    setStarting(categoryId ?? 'random')
    reset()
    const session = await createGameSession(user.id, null, 'endless', categoryId)
    setSession(session.id, 'endless')
    navigate('/endless/play', { state: { sessionId: session.id, categoryId } })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Endless Mode</h1>
        <p className="text-gray-500 mb-10">Play any time. Pick a category or go random.</p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Random card */}
          <button
            onClick={() => startSession(null)}
            disabled={!!starting}
            className="col-span-2 md:col-span-1 bg-indigo-600 text-white rounded-2xl p-6 text-left hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            <div className="text-3xl mb-3">🎲</div>
            <h3 className="font-bold text-lg mb-1">Random</h3>
            <p className="text-indigo-200 text-sm">Questions from all categories mixed together</p>
            {starting === 'random' && <p className="text-indigo-200 text-xs mt-2">Starting…</p>}
          </button>

          {/* Category cards */}
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse h-36" />
            ))
          ) : (
            categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => startSession(cat.id)}
                disabled={!!starting}
                className="bg-white rounded-2xl p-6 border border-gray-100 text-left hover:border-indigo-300 hover:shadow-sm transition-all disabled:opacity-50"
              >
                <h3 className="font-bold text-gray-900 mb-1">{cat.name}</h3>
                <p className="text-xs text-gray-400">{cat.slug}</p>
                {starting === cat.id && <p className="text-indigo-600 text-xs mt-2">Starting…</p>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
