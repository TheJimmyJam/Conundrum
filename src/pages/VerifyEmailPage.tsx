import { Link } from 'react-router-dom'

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
        <div className="text-5xl mb-4">📬</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Check your email</h1>
        <p className="text-gray-500 text-sm mb-6">
          We sent a confirmation link to your email. Click it to activate your account and start playing.
        </p>
        <p className="text-xs text-gray-400">
          Didn't get it? Check your spam folder.{' '}
          <Link to="/signup" className="text-indigo-600 hover:underline">Try again</Link>
        </p>
      </div>
    </div>
  )
}
