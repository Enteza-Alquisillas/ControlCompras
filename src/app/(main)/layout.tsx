import { Sidebar } from './components/Sidebar'
import { DateDisplay } from './components/DateDisplay'
import { LogoutButton } from '@/features/auth'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar />

      {/* Main content */}
      <div className="pl-64">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div />
          <div className="flex items-center gap-4">
            <DateDisplay />
            <LogoutButton />
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
