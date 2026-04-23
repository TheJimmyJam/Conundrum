import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm tracking-widest uppercase mb-4">404</p>
        <h1 className="text-4xl font-bold text-white mb-3">Page not found</h1>
        <p className="text-gray-400 mb-8">That URL doesn't exist. Maybe it was moved, or you mistyped it.</p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/"
            className="bg-amber-500 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-amber-600 transition-colors"
          >
            Go home
          </Link>
          <Link
            to="/play"
            className="border border-white/20 text-gray-300 font-medium px-6 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            Play today
          </Link>
        </div>
      </div>
    </div>
  )
}
