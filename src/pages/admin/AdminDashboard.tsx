import { Link } from 'react-router-dom'

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Admin</h1>
        <p className="text-gray-400 mb-10">Cnndrm control panel</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { to: '/admin/questions', label: 'Questions', icon: '❓' },
            { to: '/admin/daily-set', label: 'Daily Sets', icon: '📅' },
            { to: '/admin/daily-submission', label: 'Daily Submission', icon: '📰' },
            { to: '/admin/submissions', label: 'Submissions', icon: '💡' },
            { to: '/admin/categories', label: 'Categories', icon: '🏷' },
            { to: '/admin/reports', label: 'Reports', icon: '🚩' },
            { to: '/admin/players', label: 'Players', icon: '👥' },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-amber-500/30 hover:shadow-lg shadow-black/20 transition-all"
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <p className="font-semibold text-white">{item.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
