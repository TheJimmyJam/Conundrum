import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import { ProtectedRoute } from './features/auth/ProtectedRoute'

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
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminQuestions from './pages/admin/AdminQuestions'
import AdminDailySet from './pages/admin/AdminDailySet'
import AdminReports from './pages/admin/AdminReports'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />

          {/* Authenticated */}
          <Route path="/play" element={<ProtectedRoute><PlayPage /></ProtectedRoute>} />
          <Route path="/results/:sessionId" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />

          {/* Endless Mode */}
          <Route path="/endless" element={<ProtectedRoute><EndlessHubPage /></ProtectedRoute>} />
          <Route path="/endless/play" element={<ProtectedRoute><EndlessPlayPage /></ProtectedRoute>} />
          <Route path="/endless/results/:sessionId" element={<ProtectedRoute><EndlessResultsPage /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/questions" element={<ProtectedRoute requireAdmin><AdminQuestions /></ProtectedRoute>} />
          <Route path="/admin/daily-set" element={<ProtectedRoute requireAdmin><AdminDailySet /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute requireAdmin><AdminReports /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
