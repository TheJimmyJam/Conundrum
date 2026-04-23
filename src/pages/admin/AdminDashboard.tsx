import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type Stats = {
  questions: number
  dailySets: number
  pendingSubmissions: number
  categories: number
  players: number
  reports: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    async function loadStats() {
      const [questions, dailySets, submissions, categories, players, reports] = await Promise.all([
        supabase.from('questions').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('daily_sets').select('*', { count: 'exact', head: true }),
        supabase.from('question_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('categories').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('question_submissions').select('*', { count: 'exact', head: true }).eq('status', 'flagged'),
      ])
      setStats({
        questions:           questions.count  ?? 0,
        dailySets:           dailySets.count  ?? 0,
        pendingSubmissions:  submissions.count ?? 0,
        categories:          categories.count ?? 0,
        players:             players.count    ?? 0,
        reports:             reports.count    ?? 0,
      })
    }
    loadStats()
  }, [])

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  const cards = [
    { to: '/admin/questions',         label: 'Questions',        icon: '❓', count: stats?.questions },
    { to: '/admin/daily-set',         label: 'Daily Sets',       icon: '📅', count: stats?.dailySets },
    { to: '/admin/daily-submission',  label: 'Daily Submission', icon: '📰', count: stats?.pendingSubmissions, badge: true },
    { to: '/admin/submissions',       label: 'Submissions',      icon: '💡', count: stats?.pendingSubmissions, badge: true },
    { to: '/admin/categories',        label: 'Categories',       icon: '🏷', count: stats?.categories },
    { to: '/admin/reports',           label: 'Reports',          icon: '🚩', count: stats?.reports, badge: true },
    { to: '/admin/players',           label: 'Players',          icon: '👥', count: stats?.players },
  ]

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Admin</h1>
        <p className="text-gray-400 mb-10">Cnndrm control panel</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-amber-500/30 hover:shadow-lg shadow-black/20 transition-all"
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <p className="font-semibold text-white mb-1">{item.label}</p>
              {item.count === undefined ? (
                <div className="h-6 w-12 bg-white/10 rounded animate-pulse" />
              ) : (
                <p className={`text-2xl font-bold ${
                  item.badge && item.count > 0 ? 'text-amber-400' : 'text-gray-300'
                }`}>
                  {fmt(item.count)}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
