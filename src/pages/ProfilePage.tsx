import { useAuthStore } from '../store/authStore'
import { Link } from 'react-router-dom'

export default function ProfilePage() {
  const { profile, signOut } = useAuthStore()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
          <button onClick={signOut} className="text-sm text-red-500 hover:text-red-700">Sign out</button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-2xl font-bold text-indigo-700">
              {profile?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{profile?.display_name ?? profile?.username}</h2>
              <p className="text-sm text-gray-400">@{profile?.username}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link to="/history" className="flex-1 bg-white border border-gray-200 text-gray-700 font-medium py-3 rounded-xl text-center hover:bg-gray-50 text-sm">
            Game History
          </Link>
          <Link to="/play" className="flex-1 bg-indigo-600 text-white font-medium py-3 rounded-xl text-center hover:bg-indigo-700 text-sm">
            Today's Round
          </Link>
        </div>
      </div>
    </div>
  )
}
