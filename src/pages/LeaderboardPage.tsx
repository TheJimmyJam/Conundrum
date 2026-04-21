import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { formatDuration } from '../lib/scoring'
import {
  getTodaysDailySet,
  getDailyLeaderboard,
  getEndlessLifetimeStreaks,
  getEndlessDailyStreaks,
} from '../lib/api'
import type { LeaderboardEntry } from '../types'

type Tab = 'daily' | 'lifetime' | 'days'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">🥇</span>
  if (rank === 2) return <span className="text-xl">🥈</span>
  if (rank === 3) return <span className="text-xl">🥉</span>
  return <span className="text-sm font-bold text-gray-400 w-7 text-center">#{rank}</span>
}

export default function LeaderboardPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('daily')

  const [dailyEntries, setDailyEntries] = useState<LeaderboardEntry[]>([])
  const [lifetimeEntries, setLifetimeEntries] = useState<{ rank: number; user_id: string; username: string; display_name: string | null; best_streak: number }[]>([])
  const [dayStreakEntries, setDayStreakEntries] = useState<{ rank: number; user_id: string; username: string; display_name: string | null; best_streak: number }[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [set, lifetime, days] = await Promise.all([
          getTodaysDailySet(),
          getEndlessLifetimeStreaks(),
          getEndlessDailyStreaks(),
        ])
        if (set) {
          const daily = await getDailyLeaderboard(set.id)
          setDailyEntries(daily)
        }
        setLifetimeEntries(lifetime)
        setDayStreakEntries(days)
      } catch (err) {
        console.error('Leaderboard load error:', err)
        setError('Failed to load leaderboard.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: 'daily',    label: "Today's Daily",        desc: 'Most correct answers · fastest time breaks ties' },
    { id: 'lifetime', label: 'Endless Best Streak',  desc: 'Longest question streak ever in a single session' },
    { id: 'days',     label: 'Endless Day Streak',   desc: 'Most consecutive days playing endless mode' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Leaderboard</h1>
        <p className="text-gray-500 text-sm mb-8">See how you stack up.</p>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 text-xs font-medium py-2 px-2 rounded-lg transition-colors ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400 mb-5 text-center">
          {tabs.find((t) => t.id === tab)?.desc}
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500">{error}</div>
        ) : tab === 'daily' ? (
          <DailyTable entries={dailyEntries} userId={user?.id} />
        ) : tab === 'lifetime' ? (
          <StreakTable
            entries={lifetimeEntries}
            userId={user?.id}
            sublabel="Best streak"
            unit="in a row"
          />
        ) : (
          <StreakTable
            entries={dayStreakEntries}
            userId={user?.id}
            sublabel="Day streak"
            unit="days"
          />
        )}
      </div>
    </div>
  )
}

function DailyTable({ entries, userId }: { entries: LeaderboardEntry[]; userId?: string }) {
  if (entries.length === 0) return (
    <div className="text-center py-20 text-gray-400">No scores yet today. Be the first!</div>
  )
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {entries.map((entry) => {
        const isMe = entry.user_id === userId
        return (
          <div
            key={entry.user_id}
            className={`flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 ${isMe ? 'bg-indigo-50' : ''}`}
          >
            <div className="w-8 flex justify-center flex-shrink-0">
              <RankBadge rank={entry.rank} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">
                {entry.display_name ?? entry.username}
                {isMe && <span className="ml-2 text-xs text-indigo-500 font-normal">you</span>}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {entry.correct_count}/10 correct · {formatDuration(Number(entry.duration_ms))}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-gray-900">{entry.score.toLocaleString()}</p>
              <p className="text-xs text-gray-400">pts</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StreakTable({
  entries,
  userId,
  sublabel,
  unit,
}: {
  entries: { rank: number; user_id: string; username: string; display_name: string | null; best_streak: number }[]
  userId?: string
  sublabel: string
  unit: string
}) {
  if (entries.length === 0) return (
    <div className="text-center py-20 text-gray-400">No endless sessions yet — be the first!</div>
  )
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {entries.map((entry) => {
        const isMe = entry.user_id === userId
        return (
          <div
            key={entry.user_id}
            className={`flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 ${isMe ? 'bg-indigo-50' : ''}`}
          >
            <div className="w-8 flex justify-center flex-shrink-0">
              <RankBadge rank={entry.rank} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">
                {entry.display_name ?? entry.username}
                {isMe && <span className="ml-2 text-xs text-indigo-500 font-normal">you</span>}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-gray-900">{entry.best_streak}</p>
              <p className="text-xs text-gray-400">{unit}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
