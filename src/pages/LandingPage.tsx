import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Navbar } from '../components/Navbar'

export default function LandingPage() {
  const { user } = useAuthStore()

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <main className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6 tracking-tight">
          One round. Ten questions.<br />Beat your friends.
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-xl mx-auto">
          A fresh trivia set drops every day. Answer fast, score high, and challenge anyone who thinks they can beat you.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to={user ? '/play' : '/signup'}
            className="bg-indigo-600 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:bg-indigo-700 transition-colors"
          >
            Play Today's Round
          </Link>
          {user && (
            <Link
              to="/endless"
              className="border border-indigo-600 text-indigo-600 font-semibold px-8 py-4 rounded-xl text-lg hover:bg-indigo-50 transition-colors"
            >
              Endless Mode
            </Link>
          )}
        </div>

        {/* How it works */}
        <div className="mt-24 grid grid-cols-3 gap-8 text-left">
          {[
            { step: '1', title: 'Play the daily set', desc: '10 timed questions, fresh every day. Faster correct answers score more.' },
            { step: '2', title: 'Check the leaderboard', desc: 'See where you rank globally or just among your friends.' },
            { step: '3', title: 'Challenge a friend', desc: 'Send a direct challenge link. Beat their score to claim bragging rights.' },
          ].map((item) => (
            <div key={item.step} className="p-6 rounded-xl border border-gray-100 bg-gray-50">
              <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-sm mb-3">
                {item.step}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
