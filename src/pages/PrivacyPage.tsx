import { Link } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-3xl mx-auto px-6 py-16">

        <Link to="/" className="text-amber-400 font-bold text-xl block mb-12">← Cnndrm</Link>

        <h1 className="text-4xl font-black text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-4">Last updated: April 2026</p>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-6 py-5 mb-12">
          <p className="text-amber-300 font-semibold text-lg mb-1">Our Promise</p>
          <p className="text-amber-200/80 leading-relaxed">We believe in absolute privacy. We will never sell your data, share it with advertisers, or use it to market to you in any way. Your information exists solely to make Conundrum work for you — nothing else, ever.</p>
        </div>

        <div className="space-y-10 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. What We Collect</h2>
            <p className="mb-3">We collect only what's necessary to run the game:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li><span className="text-gray-200 font-medium">Email address</span> — for account creation and password recovery only</li>
              <li><span className="text-gray-200 font-medium">Username</span> — displayed on leaderboards and in challenges</li>
              <li><span className="text-gray-200 font-medium">Game data</span> — your scores, streaks, answers, and session history</li>
              <li><span className="text-gray-200 font-medium">Submitted questions</span> — content you voluntarily submit for review</li>
            </ul>
            <p className="mt-3">We do not collect your real name, phone number, location, payment information, or any sensitive personal data.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. How We Use Your Data</h2>
            <p className="mb-3">Your data is used exclusively to:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Operate your account and authenticate your sessions</li>
              <li>Display your scores and rank on leaderboards</li>
              <li>Enable friend challenges and social features</li>
              <li>Send you in-app notifications (challenges, leaderboard updates)</li>
              <li>Review and moderate submitted trivia questions</li>
              <li>Detect and prevent cheating or abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. What We Don't Do — Ever</h2>
            <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-4 space-y-2">
              {[
                "Sell your data to anyone, for any reason",
                "Share your data with advertisers or data brokers",
                "Send you marketing emails or promotional spam",
                "Use your data to build advertising profiles",
                "Allow third-party tracking on our platform",
                "Mine your data for AI training without explicit consent",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-red-400 font-bold mt-0.5 flex-shrink-0">✕</span>
                  <p className="text-gray-300">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Data Storage & Security</h2>
            <p>Your data is stored securely using Supabase, which provides enterprise-grade encryption at rest and in transit. We use Row Level Security to ensure users can only access their own data. Passwords are never stored in plain text — they are hashed using industry-standard methods by our authentication provider.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Third-Party Services</h2>
            <p>Conundrum uses a small number of infrastructure services to operate:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400 mt-3">
              <li><span className="text-gray-200 font-medium">Supabase</span> — database and authentication (<a href="https://supabase.com/privacy" className="text-amber-400 hover:underline" target="_blank" rel="noreferrer">privacy policy</a>)</li>
              <li><span className="text-gray-200 font-medium">Netlify</span> — hosting and deployment (<a href="https://www.netlify.com/privacy/" className="text-amber-400 hover:underline" target="_blank" rel="noreferrer">privacy policy</a>)</li>
            </ul>
            <p className="mt-3">None of these services receive your data for marketing or advertising purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Leaderboards & Public Data</h2>
            <p>Your username and game scores are visible to other users on leaderboards and in friend challenges. This is the nature of a competitive game. Your email address is never visible to other users. If you'd prefer not to appear on public leaderboards, you can use a pseudonymous username.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Your Rights</h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Access the data we hold about you</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your account and all associated data</li>
              <li>Export your game history</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us at <span className="text-amber-400">support@conundrum2026.com</span> and we'll handle it promptly.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Children's Privacy</h2>
            <p>Conundrum is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has created an account, contact us and we will promptly delete the account and its data.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Changes to This Policy</h2>
            <p>If we ever make meaningful changes to this policy, we'll notify you via in-app notification. The "last updated" date at the top of this page will always reflect the most recent revision. We will never retroactively weaken your privacy protections without explicit notice.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Contact</h2>
            <p>Privacy questions or concerns? We take this seriously. Reach us at <span className="text-amber-400">support@conundrum2026.com</span>.</p>
          </section>

        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex gap-6 text-sm text-gray-500">
          <Link to="/terms" className="hover:text-amber-400 transition-colors">Terms of Service</Link>
          <Link to="/" className="hover:text-amber-400 transition-colors">Back to Conundrum</Link>
        </div>

      </div>
    </div>
  )
}
