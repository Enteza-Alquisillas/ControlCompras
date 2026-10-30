import { MainShell } from './components/main-shell'
import { DateDisplay } from './components/DateDisplay'
import { LogoutButton } from '@/features/auth'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MainShell
      header={
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div />
          <div className="flex items-center gap-4">
            <DateDisplay />
            <LogoutButton />
          </div>
        </header>
      }
    >
      {children}
    </MainShell>
  )
}
