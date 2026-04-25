import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { formatDuration } from '../lib/scoring'
import {
  getActiveDailySet,
  getDailyLeaderboard,
  getDailyLeaderboardFriends,
  getEndlessLifetimeStreaks,
  getEndlessDailyStreaks,
  getDailyLifetimeLeaderboard,
} from '../lib/api'
import { GlobalCrownBadge, FriendsCrownBadge } from '../components/CrownIcons'
import type { LeaderboardEntry } from '../types'

type Tab = 'daily' | 'lifetime' | 'days' | 'lifetime-daily'
type DailySubTab = 'global' | 'friends'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">🥇</span>
  if (rank === 2) return <span className="text-xl">🥈</span>
  if (rank === 3) return <span className="text-xl">🥉</span>
  return <span className="text-sm font-bold text-gray-400 w-7 text-center">#{rank}</span>
}

export default function LeaderboardPage() {
  const { user, loading: authLoading } = useAuthStore()
  const [tab, setTab] = useState<Tab>('daily')
  const [dailySub, setDailySub] = useState<DailySubTab>('global')

  const [globalEntries, setGlobalEntries] = useState<LeaderboardEntry[]>([])
  const [friendEntries, setFriendEntries] = useState<LeaderboardEntry[]>([])
  const [lifetimeEntries, setLifetimeEntries] = useState<{ rank: number; user_id: string; username: string; display_name: string | null; best_streak: number }[]>([])
  const [dayStreakEntries, setDayStreakEntries] = useState<{ rank: number; user_id: string; username: string; display_name: string | null; best_streak: number }[]>([])
  const [lifetimeDailyEntries, setLifetimeDailyEntries] = useState<{ rank: number; user_id: string; username: string; display_name: string | null; total_score: number; games_played: number }[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function fetchLeaderboard() {
    setLoading(true)
    setError(null)

    let cancelled = false

    const timer = setTimeout(() => {
      if (!cancelled) {
        setError('Taking too long to load — tap retry.')
        setLoading(false)
      }
    }, 8000)

    async function load() {
      try {
        const [set, lifetime, days, lifetimeDaily] = await Promise.all([
          getActiveDailySet(),
          getEndlessLifetimeStreaks(),
          getEndlessDailyStreaks(),
          getDailyLifetimeLeaderboard(),
        ])
        if (cancelled) return
        setLifetimeEntries(lifetime)
        setDayStreakEntries(days)
        setLifetimeDailyEntries(lifetimeDaily)
        if (set) {
          const [global, friends] = await Promise.all([
            getDailyLeaderboard(set.id),
            user ? getDailyLeaderboardFriends(set.id) : Promise.resolve([]),
          ])
          if (cancelled) return
          setGlobalEntries(global)
          setFriendEntries(friends)
        }
      } catch (err) {
        if (cancelled) return
        console.error('Leaderboard load error:', err)
        setError('Failed to load leaderboard.')
      } finally {
        clearTimeout(timer)
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }

  useEffect(() => {
    // Wait for auth to fully resolve before fetching — prevents double-fetch
    // race where user flips null → real ID and fires two concurrent loads
    if (authLoading) return
    return fetchLeaderboard()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'daily',          label: "Today's Daily" },
    { id: 'lifetime-daily', label: 'Lifetime Daily' },
    { id: 'lifetime',       label: 'Endless Best Streak' },
    { id: 'days',           label: 'Endless Day Streak' },
  ]

  const subDesc: Record<DailySubTab, string> = {
    global:  'Most correct answers · fastest time breaks ties · everyone',
    friends: 'Most correct answers · fastest time breaks ties · your friends',
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-white mb-1">Leaderboard</h1>
        <p className="text-gray-400 text-sm mb-8">See how you stack up.</p>

        {/* Main tabs */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl mb-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 text-xs font-medium py-2 px-2 rounded-lg transition-colors ${
                tab === t.id ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={fetchLeaderboard}
              className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
            >
              Retry
            </button>
          </div>
        ) : tab === 'daily' ? (
          <>
            {/* Global / Friends sub-tabs */}
            <div className="flex border-b border-white/10 mb-5">
              {(['global', 'friends'] as DailySubTab[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setDailySub(s)}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                    dailySub === s
                      ? 'border-amber-500 text-amber-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mb-5">{subDesc[dailySub]}</p>

            {dailySub === 'global' ? (
              <DailyTable entries={globalEntries} userId={user?.id} crownType="global" />
            ) : !user ? (
              <div className="text-center py-20">
                <p className="text-gray-400 mb-4">Sign in to see your friends' scores.</p>
                <Link to="/login" className="bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-amber-600">
                  Log in
                </Link>
              </div>
            ) : friendEntries.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-3">👥</div>
                <p className="text-gray-400 mb-2">No friends have played yet today.</p>
                <p className="text-xs text-gray-400 mb-5">Add friends and challenge them from the Friends tab.</p>
                <Link to="/friends" className="bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-amber-600">
                  Go to Friends
                </Link>
              </div>
            ) : (
              <DailyTable entries={friendEntries} userId={user?.id} crownType="friends" />
            )}
          </>
        ) : tab === 'lifetime-daily' ? (
          <>
            <p className="text-xs text-gray-400 mb-5">Cumulative score across all daily sets ever played</p>
            <LifetimeDailyTable entries={lifetimeDailyEntries} userId={user?.id} />
          </>
        ) : tab === 'lifetime' ? (
          <>
            <p className="text-xs text-gray-400 mb-5">Longest question streak ever in a single endless session</p>
            <StreakTable entries={lifetimeEntries} userId={user?.id} sublabel="Best streak" unit="in a row" />
          </>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-5">Most consecutive days playing endless mode</p>
            <StreakTable entries={dayStreakEntries} userId={user?.id} sublabel="Day streak" unit="days" />
          </>
        )}
      </div>
    </div>
  )
}

function DailyTable({ entries, userId, crownType }: { entries: LeaderboardEntry[]; userId?: string; crownType?: 'global' | 'friends' }) {
  if (entries.length === 0) return (
    <div className="text-center py-20 text-gray-400">No scores yet today. Be the first!</div>
  )
  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      {entries.map((entry) => {
        const isMe = entry.user_id === userId
        const isFlagged = entry.anti_cheat_flag === true
        const isFirst = entry.rank === 1 && !isFlagged
        return (
          <div
            key={entry.user_id}
            className={`flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0 ${
              isFlagged ? 'bg-amber-50/60' : isMe ? 'bg-amber-500/10' : isFirst ? 'bg-yellow-50/50' : ''
            }`}
          >
            <div className="w-8 flex justify-center flex-shrink-0">
              {isFlagged
                ? <span className="text-base" title="Score flagged — not ranked">⚠️</span>
                : <RankBadge rank={entry.rank} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`font-semibold text-sm truncate ${isFlagged ? 'text-gray-400' : 'text-white'}`}>
                  {entry.display_name ?? entry.username}
                </p>
                {isMe && <span className="text-xs text-amber-400 font-normal">you</span>}
                {isFlagged && <span className="text-xs text-amber-600 font-normal">not ranked</span>}
                {isFirst && crownType === 'global' && <GlobalCrownBadge />}
                {isFirst && crownType === 'friends' && <FriendsCrownBadge />}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {entry.correct_count}/10 correct · {formatDuration(Number(entry.duration_ms))}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`font-bold ${isFlagged ? 'text-gray-400' : 'text-white'}`}>{entry.score.toLocaleString()}</p>
              <p className="text-xs text-gray-400">pts</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LifetimeDailyTable({
  entries,
  userId,
}: {
  entries: { rank: number; user_id: string; username: string; display_name: string | null; total_score: number; games_played: number }[]
  userId?: string
}) {
  if (entries.length === 0) return (
    <div className="text-center py-20 text-gray-400">No daily sets played yet — be the first!</div>
  )
  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      {entries.map((entry) => {
        const isMe = entry.user_id === userId
        const isFirst = entry.rank === 1
        return (
          <div
            key={entry.user_id}
            className={`flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0 ${
              isMe ? 'bg-amber-500/10' : isFirst ? 'bg-yellow-50/50' : ''
            }`}
          >
            <div className="w-8 flex justify-center flex-shrink-0">
              <RankBadge rank={entry.rank} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-white text-sm truncate">
                  {entry.display_name ?? entry.username}
                </p>
                {isMe && <span className="text-xs text-amber-400 font-normal">you</span>}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{entry.games_played} {entry.games_played === 1 ? 'set' : 'sets'} played</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-white">{entry.total_score.toLocaleString()}</p>
              <p className="text-xs text-gray-400">total pts</p>
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
    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      {entries.map((entry) => {
        const isMe = entry.user_id === userId
        return (
          <div
            key={entry.user_id}
            className={`flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0 ${isMe ? 'bg-amber-500/10' : ''}`}
          >
            <div className="w-8 flex justify-center flex-shrink-0">
              <RankBadge rank={entry.rank} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm truncate">
                {entry.display_name ?? entry.username}
                {isMe && <span className="ml-2 text-xs text-amber-400 font-normal">you</span>}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-white">{entry.best_streak}</p>
              <p className="text-xs text-gray-400">{unit}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
