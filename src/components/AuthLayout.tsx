import { Navbar } from './Navbar'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col">
      <Navbar />
      <div className="flex-1">{children}</div>
    </div>
  )
}
