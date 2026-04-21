import { Link } from 'react-router-dom'

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin</h1>
        <p className="text-gray-500 mb-10">Cnndrm control panel</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { to: '/admin/questions', label: 'Questions', icon: '❓' },
            { to: '/admin/daily-set', label: 'Daily Sets', icon: '📅' },
            { to: '/admin/submissions', label: 'Submissions', icon: '💡' },
            { to: '/admin/categories', label: 'Categories', icon: '🏷' },
            { to: '/admin/reports', label: 'Reports', icon: '🚩' },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="bg-white border border-gray-100 rounded-2xl p-6 hover:border-indigo-200 hover:shadow-sm transition-all"
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <p className="font-semibold text-gray-900">{item.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
