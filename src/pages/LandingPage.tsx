import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Navbar } from '../components/Navbar'
import { getFeaturedSubmission, recordCommunityAnswer, getCommunityCorrectCount } from '../lib/api'

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
    getFeaturedSubmission().then(setFeatured).catch(() => {})
  }, [])

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

    if (user) {
      await recordCommunityAnswer(featured.id, isCorrect)
      const count = await getCommunityCorrectCount()
      setCorrectCount(count)
    }

    // After 1.8s, slide to tally view
    setTimeout(() => setShowTally(true), 1800)
  }

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

        {/* Community Question of the Day */}
        {featured && (
          <div className="mt-24 text-left">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">🏆</span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Community Question of the Day</h2>
                <p className="text-sm text-gray-500">
                  Submitted by{' '}
                  <span className="font-semibold text-indigo-600">@{featured.username}</span>
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6 overflow-hidden">

              {/* Tally view — slides in after answering */}
              {showTally ? (
                <div className="text-center py-6 animate-fade-in">
                  {answerState === 'correct' ? (
                    <>
                      <div className="text-5xl mb-3">🎉</div>
                      <h3 className="text-2xl font-bold text-green-700 mb-1">Correct!</h3>
                      <p className="text-gray-500 text-sm mb-6">Nice one — you knew that.</p>
                    </>
                  ) : (
                    <>
                      <div className="text-5xl mb-3">😬</div>
                      <h3 className="text-2xl font-bold text-red-600 mb-1">Not quite!</h3>
                      <p className="text-gray-500 text-sm mb-2">
                        The correct answer was{' '}
                        <span className="font-semibold text-gray-800">
                          {options.find(o => o.key === featured.correct_option)?.text}
                        </span>
                      </p>
                      {featured.explanation && (
                        <p className="text-xs text-gray-400 mb-6">💡 {featured.explanation}</p>
                      )}
                    </>
                  )}

                  {user && correctCount !== null ? (
                    <div className="inline-flex items-center gap-3 bg-white rounded-2xl border border-indigo-100 px-6 py-4 shadow-sm">
                      <span className="text-3xl font-black text-indigo-600">{correctCount}</span>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-800">
                          community {correctCount === 1 ? 'question' : 'questions'} correct
                        </p>
                        <p className="text-xs text-gray-400">lifetime total</p>
                      </div>
                    </div>
                  ) : !user ? (
                    <p className="text-sm text-gray-400">
                      <Link to="/signup" className="text-indigo-600 font-medium hover:underline">Sign up</Link> to track your community question streak.
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  {/* Answer feedback banner */}
                  {answerState === 'correct' && (
                    <div className="flex items-center gap-2 bg-green-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl mb-4 animate-fade-in">
                      <span className="text-lg">🎉</span> Correct! Well done!
                    </div>
                  )}
                  {answerState === 'wrong' && (
                    <div className="flex items-center gap-2 bg-red-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl mb-4 animate-fade-in">
                      <span className="text-lg">😬</span> Not quite — see the correct answer below.
                    </div>
                  )}

                  <p className="text-lg font-semibold text-gray-900 mb-5">{featured.prompt}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {options.map((opt) => {
                      const isCorrect = opt.key === featured.correct_option
                      const isSelected = selected === opt.key
                      const isWrong = isSelected && !isCorrect
                      const revealed = answerState !== 'unanswered'

                      let cls = 'border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
                      if (revealed && isCorrect) cls = 'border-green-400 bg-green-50 text-green-800'
                      else if (revealed && isWrong) cls = 'border-red-400 bg-red-50 text-red-800'
                      else if (revealed) cls = 'border-gray-200 bg-white text-gray-400 cursor-default'

                      return (
                        <button
                          key={opt.key}
                          onClick={() => handleOptionClick(opt.key)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-colors ${cls}`}
                        >
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            revealed && isCorrect ? 'bg-green-500 text-white' :
                            revealed && isWrong ? 'bg-red-400 text-white' :
                            'bg-gray-100 text-gray-500'
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
                    <div className="bg-white bg-opacity-70 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed">
                      💡 {featured.explanation}
                    </div>
                  )}

                  {answerState === 'unanswered' && (
                    <p className="text-xs text-indigo-400 text-center mt-2">Tap an answer to reveal it</p>
                  )}
                </>
              )}
            </div>

            <p className="text-center text-sm text-gray-400 mt-4">
              Think you've got a great trivia question?{' '}
              <Link to={user ? '/submit' : '/signup'} className="text-indigo-600 font-medium hover:underline">
                Submit yours
              </Link>{' '}
              and get featured here.
            </p>
          </div>
        )}

        {/* Submit CTA (when no featured question) */}
        {!featured && (
          <div className="mt-20 bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-3">💡</div>
            <h3 className="font-bold text-gray-900 mb-2">Got a great trivia question?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Submit it and if it's selected as the daily community pick, you'll be featured right here.
            </p>
            <Link
              to={user ? '/submit' : '/signup'}
              className="inline-block bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 text-sm"
            >
              {user ? 'Submit a Question' : 'Sign up to Submit'}
            </Link>
          </div>
        )}

      </main>
    </div>
  )
}
