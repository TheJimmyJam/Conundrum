import { Link } from 'react-router-dom'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-3xl mx-auto px-6 py-16">

        <Link to="/" className="text-amber-400 font-bold text-xl block mb-12">← Cnndrm</Link>

        <h1 className="text-4xl font-black text-white mb-2">Terms of Service</h1>
        <p className="text-gray-500 text-sm mb-12">Last updated: April 2026</p>

        <div className="space-y-10 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
            <p>By creating an account or using Conundrum ("the Service"), you agree to these Terms of Service. If you do not agree, please do not use the Service. We may update these terms occasionally — continued use after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Eligibility</h2>
            <p>You must be at least 13 years old to use Conundrum. By using the Service, you confirm that you meet this requirement. If you are under 18, you represent that you have your parent or guardian's permission.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Your Account</h2>
            <p>You are responsible for maintaining the security of your account credentials. You agree not to share your password or allow others to access your account. You are responsible for all activity that occurs under your account. Notify us immediately if you suspect unauthorized access.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Acceptable Use</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-400">
              <li>Use bots, scripts, or any automated means to interact with the Service</li>
              <li>Attempt to manipulate scores, leaderboards, or game outcomes</li>
              <li>Submit questions that are offensive, hateful, harmful, or inaccurate</li>
              <li>Harass, impersonate, or threaten other users</li>
              <li>Attempt to access other users' accounts or data</li>
              <li>Reverse-engineer or attempt to extract the underlying source of the Service</li>
            </ul>
            <p className="mt-3">We reserve the right to suspend or terminate accounts that violate these rules.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. User-Submitted Content</h2>
            <p>When you submit a trivia question, you grant Conundrum a non-exclusive, royalty-free license to use, display, and include that content in the game. You represent that your submission is original and doesn't infringe on anyone else's rights. We reserve the right to reject, edit, or remove submitted content at our discretion.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Intellectual Property</h2>
            <p>The Conundrum name, logo, design, and all original content are owned by Conundrum and protected by applicable intellectual property laws. You may not use our branding or content without explicit written permission.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Disclaimers</h2>
            <p>Conundrum is provided "as is" without warranties of any kind. We do not guarantee that the Service will be uninterrupted, error-free, or that all trivia answers are perfectly accurate. Trivia is inherently subjective — if you believe an answer is wrong, use the report feature.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, Conundrum shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service. Our total liability to you for any claims shall not exceed $100.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Termination</h2>
            <p>You may delete your account at any time by contacting us. We reserve the right to suspend or terminate accounts that violate these Terms, with or without notice. Upon termination, your right to use the Service ceases immediately.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Contact</h2>
            <p>Questions about these Terms? Reach us at <span className="text-amber-400">support@conundrum2026.com</span>.</p>
          </section>

        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex gap-6 text-sm text-gray-500">
          <Link to="/privacy" className="hover:text-amber-400 transition-colors">Privacy Policy</Link>
          <Link to="/" className="hover:text-amber-400 transition-colors">Back to Conundrum</Link>
        </div>

      </div>
    </div>
  )
}
