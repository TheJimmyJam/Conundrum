import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { getPlayerCrowns, getMySessionHistory } from '../lib/api'
import { GlobalCrown, FriendsCrown } from '../components/CrownIcons'

type CrownCounts = { global: number; friends: number }

export default function ProfilePage() {
  const { profile, user } = useAuthStore()
  const [crowns, setCrowns] = useState<CrownCounts | null>(null)
  const [stats, setStats] = useState<{ gamesPlayed: number; perfectRounds: number; avgScore: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      getPlayerCrowns(),
      getMySessionHistory(user.id, 100),
    ]).then(([c, history]) => {
      setCrowns(c)
      const completed = history.filter((s: any) => s.status === 'completed')
      const perfect = completed.filter((s: any) => s.correct_count === 10 && s.question_count === 10)
      const totalScore = completed.reduce((sum: number, s: any) => sum + (s.score ?? 0), 0)
      setStats({
        gamesPlayed: completed.length,
        perfectRounds: perfect.length,
        avgScore: completed.length > 0 ? Math.round(totalScore / completed.length) : 0,
      })
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [user])

  const initial = profile?.username?.[0]?.toUpperCase() ?? '?'
  const displayName = profile?.display_name ?? profile?.username ?? 'Player'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Identity card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-2xl font-bold text-indigo-700 flex-shrink-0">
              {initial}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
              <p className="text-sm text-gray-400">@{profile?.username}</p>
            </div>
          </div>
        </div>

        {/* Crowns */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-5">Daily #1 Crowns</h3>

          {loading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {/* Global crown */}
              <div className={`rounded-xl border p-5 text-center ${
                (crowns?.global ?? 0) > 0
                  ? 'border-yellow-200 bg-gradient-to-b from-yellow-50 to-white'
                  : 'border-gray-100 bg-gray-50 opacity-50'
              }`}>
                <div className="flex justify-center mb-3">
                  <GlobalCrown size={48} />
                </div>
                <p className="text-3xl font-black text-gray-900 mb-1">
                  {crowns?.global ?? 0}
                </p>
                <p className="text-sm font-semibold text-yellow-600">Global #1</p>
                <p className="text-xs text-gray-400 mt-1">
                  {(crowns?.global ?? 0) === 1 ? 'day at the top' : 'days at the top'}
                </p>
              </div>

              {/* Friends crown */}
              <div className={`rounded-xl border p-5 text-center ${
                (crowns?.friends ?? 0) > 0
                  ? 'border-violet-200 bg-gradient-to-b from-violet-50 to-white'
                  : 'border-gray-100 bg-gray-50 opacity-50'
              }`}>
                <div className="flex justify-center mb-3">
                  <FriendsCrown size={48} />
                </div>
                <p className="text-3xl font-black text-gray-900 mb-1">
                  {crowns?.friends ?? 0}
                </p>
                <p className="text-sm font-semibold text-violet-600">Friends #1</p>
                <p className="text-xs text-gray-400 mt-1">
                  {(crowns?.friends ?? 0) === 1 ? 'day at the top' : 'days at the top'}
                </p>
              </div>
            </div>
          )}

          {!loading && (crowns?.global ?? 0) === 0 && (crowns?.friends ?? 0) === 0 && (
            <p className="text-center text-xs text-gray-400 mt-4">
              Win #1 on the daily leaderboard to earn your first crown.
            </p>
          )}
        </div>

        {/* Quick stats */}
        {!loading && stats && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Stats</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-black text-gray-900">{stats.gamesPlayed}</p>
                <p className="text-xs text-gray-400 mt-0.5">Games played</p>
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{stats.perfectRounds}</p>
                <p className="text-xs text-gray-400 mt-0.5">Perfect rounds</p>
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900">{stats.avgScore.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-0.5">Avg score</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <Link to="/awards" className="flex-1 bg-white border border-gray-200 text-gray-700 font-medium py-3 rounded-xl text-center hover:bg-gray-50 text-sm">
            🏅 Awards
          </Link>
          <Link to="/history" className="flex-1 bg-white border border-gray-200 text-gray-700 font-medium py-3 rounded-xl text-center hover:bg-gray-50 text-sm">
            History
          </Link>
          <Link to="/play" className="flex-1 bg-indigo-600 text-white font-medium py-3 rounded-xl text-center hover:bg-indigo-700 text-sm">
            Today's Round
          </Link>
        </div>

      </div>
    </div>
  )
}
