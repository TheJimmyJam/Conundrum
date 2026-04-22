import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { AuthLayout } from './components/AuthLayout'
import { Navbar } from './components/Navbar'

import LandingPage from './pages/LandingPage'
import SignupPage from './pages/SignupPage'
import LoginPage from './pages/LoginPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import PlayPage from './pages/PlayPage'
import ResultsPage from './pages/ResultsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import ProfilePage from './pages/ProfilePage'
import HistoryPage from './pages/HistoryPage'
import EndlessHubPage from './pages/EndlessHubPage'
import EndlessPlayPage from './pages/EndlessPlayPage'
import EndlessResultsPage from './pages/EndlessResultsPage'
import FriendsPage from './pages/FriendsPage'
import ChallengePlayPage from './pages/ChallengePlayPage'
import ChallengeResultsPage from './pages/ChallengeResultsPage'
import SubmitQuestionPage from './pages/SubmitQuestionPage'
import AwardsPage from './pages/AwardsPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import AdminSubmissions from './pages/admin/AdminSubmissions'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminQuestions from './pages/admin/AdminQuestions'
import AdminDailySet from './pages/admin/AdminDailySet'
import AdminReports from './pages/admin/AdminReports'
import AdminCategories from './pages/admin/AdminCategories'
import AdminCategoryQuestions from './pages/admin/AdminCategoryQuestions'
import AdminDailySubmission from './pages/admin/AdminDailySubmission'
import AdminPlayers from './pages/admin/AdminPlayers'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public — their own nav */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/leaderboard" element={<><Navbar /><LeaderboardPage /></>} />

          {/* Authenticated — shared navbar via AuthLayout */}
          <Route path="/play" element={<ProtectedRoute><AuthLayout><PlayPage /></AuthLayout></ProtectedRoute>} />
          <Route path="/results/:sessionId" element={<ProtectedRoute><AuthLayout><ResultsPage /></AuthLayout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><AuthLayout><ProfilePage /></AuthLayout></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><AuthLayout><HistoryPage /></AuthLayout></ProtectedRoute>} />

          {/* Endless Mode */}
          <Route path="/endless" element={<ProtectedRoute><AuthLayout><EndlessHubPage /></AuthLayout></ProtectedRoute>} />
          <Route path="/endless/play" element={<ProtectedRoute><AuthLayout><EndlessPlayPage /></AuthLayout></ProtectedRoute>} />
          <Route path="/endless/results/:sessionId" element={<ProtectedRoute><AuthLayout><EndlessResultsPage /></AuthLayout></ProtectedRoute>} />

          {/* Friends & Challenges */}
          <Route path="/friends" element={<ProtectedRoute><AuthLayout><FriendsPage /></AuthLayout></ProtectedRoute>} />
          <Route path="/challenge/:challengeId/play" element={<ProtectedRoute><ChallengePlayPage /></ProtectedRoute>} />
          <Route path="/challenge/:challengeId/results" element={<ProtectedRoute><AuthLayout><ChallengeResultsPage /></AuthLayout></ProtectedRoute>} />

          {/* Submit Question */}
          <Route path="/submit" element={<ProtectedRoute><AuthLayout><SubmitQuestionPage /></AuthLayout></ProtectedRoute>} />

          {/* Awards */}
          <Route path="/awards" element={<ProtectedRoute><AuthLayout><AwardsPage /></AuthLayout></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute requireAdmin><AuthLayout><AdminDashboard /></AuthLayout></ProtectedRoute>} />
          <Route path="/admin/questions" element={<ProtectedRoute requireAdmin><AuthLayout><AdminQuestions /></AuthLayout></ProtectedRoute>} />
          <Route path="/admin/daily-set" element={<ProtectedRoute requireAdmin><AuthLayout><AdminDailySet /></AuthLayout></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute requireAdmin><AuthLayout><AdminReports /></AuthLayout></ProtectedRoute>} />
          <Route path="/admin/submissions" element={<ProtectedRoute requireAdmin><AuthLayout><AdminSubmissions /></AuthLayout></ProtectedRoute>} />
          <Route path="/admin/daily-submission" element={<ProtectedRoute requireAdmin><AuthLayout><AdminDailySubmission /></AuthLayout></ProtectedRoute>} />
          <Route path="/admin/categories" element={<ProtectedRoute requireAdmin><AuthLayout><AdminCategories /></AuthLayout></ProtectedRoute>} />
          <Route path="/admin/categories/:categoryId/questions" element={<ProtectedRoute requireAdmin><AuthLayout><AdminCategoryQuestions /></AuthLayout></ProtectedRoute>} />
          <Route path="/admin/players" element={<ProtectedRoute requireAdmin><AuthLayout><AdminPlayers /></AuthLayout></ProtectedRoute>} />
          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
