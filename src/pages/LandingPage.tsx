import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Navbar } from '../components/Navbar'
import { getFeaturedSubmission, recordCommunityAnswer, getCommunityCorrectCount, getMyTodayCommunityAnswer } from '../lib/api'
import logo from '../assets/logo.png'

type FeaturedQ = {
  id: string
  username: string
  prompt: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string | null
  featured_date: string
}

type AnswerState = 'unanswered' | 'correct' | 'wrong'

export default function LandingPage() {
  const { user } = useAuthStore()
  const [featured, setFeatured] = useState<FeaturedQ | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered')
  const [showTally, setShowTally] = useState(false)
  const [correctCount, setCorrectCount] = useState<number | null>(null)

  useEffect(() => {
    async function init() {
      const sub = await getFeaturedSubmission().catch(() => null)
      if (!sub) return
      setFeatured(sub)

      const storageKey = `cqa_${sub.id}`

      // 1. Check localStorage first — instant restore, no flash
      const cached = localStorage.getItem(storageKey)
      if (cached) {
        try {
          const { isCorrect, selected: savedSelected } = JSON.parse(cached)
          setAnswerState(isCorrect ? 'correct' : 'wrong')
          if (savedSelected) setSelected(savedSelected)
          // Don't show tally — show the full revealed question so they can review it
          getCommunityCorrectCount().then(setCorrectCount).catch(() => {})
          return
        } catch {
          localStorage.removeItem(storageKey)
        }
      }

      // 2. No local cache — ask the DB (handles different device / cleared storage)
      if (user?.id) {
        const existing = await getMyTodayCommunityAnswer(sub.id).catch(() => null)
        if (existing) {
          setAnswerState(existing.is_correct ? 'correct' : 'wrong')
          // Don't show tally — show the full revealed question so they can review it
          localStorage.setItem(storageKey, JSON.stringify({ isCorrect: existing.is_correct }))
          getCommunityCorrectCount().then(setCorrectCount).catch(() => {})
        }
      }
    }
    init()
  }, [user?.id]) // re-run if auth state changes

  const options = featured
    ? [
        { key: 'a', text: featured.option_a },
        { key: 'b', text: featured.option_b },
        { key: 'c', text: featured.option_c },
        { key: 'd', text: featured.option_d },
      ]
    : []

  async function handleOptionClick(key: string) {
    if (answerState !== 'unanswered' || !featured) return
    const isCorrect = key === featured.correct_option
    setSelected(key)
    setAnswerState(isCorrect ? 'correct' : 'wrong')

    // Persist immediately so remounts stay locked — store selected key too so we can restore it
    localStorage.setItem(`cqa_${featured.id}`, JSON.stringify({ isCorrect, selected: key }))

    if (user) {
      await recordCommunityAnswer(featured.id, isCorrect)
      const count = await getCommunityCorrectCount()
      setCorrectCount(count)
    }

    // After 1.8s, slide to tally view
    setTimeout(() => setShowTally(true), 1800)
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <Navbar />

      {/* Hero */}
      <main className="max-w-4xl mx-auto px-6 py-20">
        <div className="flex flex-col sm:flex-row items-center gap-8 mb-10">
          <img src={logo} alt="Conundrum" className="w-36 h-36 object-contain drop-shadow-xl flex-shrink-0" />
          <div className="text-center sm:text-left">
            <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
              One round. Ten questions.<br />Beat your friends.
            </h1>
            <p className="text-xl text-gray-400 max-w-xl">
              A fresh trivia set drops every day. Answer fast, score high, and challenge anyone who thinks they can beat you.
            </p>
          </div>
        </div>
        <div className="flex gap-4 justify-center">
          <Link
            to={user ? '/play' : '/signup'}
            className="bg-amber-500 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:bg-amber-600 transition-colors"
          >
            Play Today's Round
          </Link>
          {user && (
            <Link
              to="/endless"
              className="border border-amber-500 text-amber-400 font-semibold px-8 py-4 rounded-xl text-lg hover:bg-amber-500/10 transition-colors"
            >
              Endless Mode
            </Link>
          )}
        </div>

        {/* How it works */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 text-left">
          {[
            { step: '1', title: 'Play the daily set', desc: '10 timed questions, fresh every day. Faster correct answers score more.' },
            { step: '2', title: 'Check the leaderboard', desc: 'See where you rank globally or just among your friends.' },
            { step: '3', title: 'Challenge a friend', desc: 'Send a direct challenge link. Beat their score to claim bragging rights.' },
          ].map((item) => (
            <div key={item.step} className="p-6 rounded-xl border border-white/10 bg-white/5">
              <div className="w-8 h-8 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center font-bold text-sm mb-3">
                {item.step}
              </div>
              <h3 className="font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Community Question of the Day */}
        {featured && (
          <div className="mt-24 text-left">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">🏆</span>
              <div>
                <h2 className="text-xl font-bold text-white">Community Question of the Day</h2>
                <p className="text-sm text-gray-400">
                  Submitted by{' '}
                  <span className="font-semibold text-amber-400">@{featured.username}</span>
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-amber-500/20 rounded-2xl p-6 overflow-hidden">

              {/* Tally view — slides in after answering */}
              {showTally ? (
                <div className="text-center py-6 animate-fade-in">
                  {answerState === 'correct' ? (
                    <>
                      <div className="text-5xl mb-3">🎉</div>
                      <h3 className="text-2xl font-bold text-green-700 mb-1">Correct!</h3>
                      <p className="text-gray-400 text-sm mb-6">Nice one — you knew that.</p>
                    </>
                  ) : (
                    <>
                      <div className="text-5xl mb-3">😬</div>
                      <h3 className="text-2xl font-bold text-red-600 mb-1">Not quite!</h3>
                      <p className="text-gray-400 text-sm mb-2">
                        The correct answer was{' '}
                        <span className="font-semibold text-gray-100">
                          {options.find(o => o.key === featured.correct_option)?.text}
                        </span>
                      </p>
                      {featured.explanation && (
                        <p className="text-xs text-gray-400 mb-6">💡 {featured.explanation}</p>
                      )}
                    </>
                  )}

                  {user && correctCount !== null ? (
                    <div className="inline-flex items-center gap-3 bg-white/5 rounded-2xl border border-amber-500/20 px-6 py-4 shadow-sm">
                      <span className="text-3xl font-black text-amber-400">{correctCount}</span>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-100">
                          community {correctCount === 1 ? 'question' : 'questions'} correct
                        </p>
                        <p className="text-xs text-gray-400">lifetime total</p>
                      </div>
                    </div>
                  ) : !user ? (
                    <p className="text-sm text-gray-400">
                      <Link to="/signup" className="text-amber-400 font-medium hover:underline">Sign up</Link> to track your community question streak.
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  {/* Answer feedback banner */}
                  {answerState === 'correct' && (
                    <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-semibold px-4 py-2.5 rounded-xl mb-4 animate-fade-in">
                      <span className="text-lg">🎉</span> Correct! Well done!
                    </div>
                  )}
                  {answerState === 'wrong' && (
                    <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-semibold px-4 py-2.5 rounded-xl mb-4 animate-fade-in">
                      <span className="text-lg">😬</span> Not quite — see the correct answer below.
                    </div>
                  )}

                  <p className="text-lg font-semibold text-white mb-5">{featured.prompt}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {options.map((opt) => {
                      const isCorrect = opt.key === featured.correct_option
                      const isSelected = selected === opt.key
                      const isWrong = isSelected && !isCorrect
                      const revealed = answerState !== 'unanswered'

                      let cls = 'border-white/10 bg-white text-gray-200 hover:border-amber-400 hover:bg-amber-500/10 cursor-pointer'
                      if (revealed && isCorrect) cls = 'border-green-500 bg-green-500/10 text-green-400'
                      else if (revealed && isWrong) cls = 'border-red-500 bg-red-500/10 text-red-400'
                      else if (revealed) cls = 'border-white/10 bg-white text-gray-400 cursor-default'

                      return (
                        <button
                          key={opt.key}
                          onClick={() => handleOptionClick(opt.key)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-colors ${cls}`}
                        >
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            revealed && isCorrect ? 'bg-green-500 text-white' :
                            revealed && isWrong ? 'bg-red-500 text-white' :
                            'bg-gray-100 text-gray-400'
                          }`}>
                            {opt.key.toUpperCase()}
                          </span>
                          {opt.text}
                          {revealed && isCorrect && <span className="ml-auto text-green-600 text-xs">✓</span>}
                        </button>
                      )
                    })}
                  </div>

                  {answerState !== 'unanswered' && featured.explanation && (
                    <div className="bg-white bg-opacity-70 rounded-xl px-4 py-3 text-xs text-gray-400 leading-relaxed">
                      💡 {featured.explanation}
                    </div>
                  )}

                  {/* Community count — shown in review state (already answered, no tally animation) */}
                  {answerState !== 'unanswered' && !showTally && (
                    <div className="mt-4 flex justify-center">
                      {user && correctCount !== null ? (
                        <div className="inline-flex items-center gap-3 bg-white/5 rounded-2xl border border-amber-500/20 px-5 py-3 shadow-sm">
                          <span className="text-2xl font-black text-amber-400">{correctCount}</span>
                          <div className="text-left">
                            <p className="text-sm font-semibold text-gray-100">
                              community {correctCount === 1 ? 'question' : 'questions'} correct
                            </p>
                            <p className="text-xs text-gray-400">lifetime total</p>
                          </div>
                        </div>
                      ) : !user ? (
                        <p className="text-sm text-gray-400">
                          <Link to="/signup" className="text-amber-400 font-medium hover:underline">Sign up</Link> to track your community question streak.
                        </p>
                      ) : null}
                    </div>
                  )}

                  {answerState === 'unanswered' && (
                    <p className="text-xs text-amber-400 text-center mt-2">Tap an answer to reveal it</p>
                  )}
                </>
              )}
            </div>

            <p className="text-center text-sm text-gray-400 mt-4">
              Think you've got a great trivia question?{' '}
              <Link to={user ? '/submit' : '/signup'} className="text-amber-400 font-medium hover:underline">
                Submit yours
              </Link>{' '}
              and get featured here.
            </p>
          </div>
        )}

        {/* Submit CTA (when no featured question) */}
        {!featured && (
          <div className="mt-20 bg-gray-50 border border-white/10 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-3">💡</div>
            <h3 className="font-bold text-white mb-2">Got a great trivia question?</h3>
            <p className="text-sm text-gray-400 mb-4">
              Submit it and if it's selected as the daily community pick, you'll be featured right here.
            </p>
            <Link
              to={user ? '/submit' : '/signup'}
              className="inline-block bg-amber-500 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-amber-600 text-sm"
            >
              {user ? 'Submit a Question' : 'Sign up to Submit'}
            </Link>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-8 py-8">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <p>© {new Date().getFullYear()} Conundrum. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/terms" className="hover:text-amber-400 transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-amber-400 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
