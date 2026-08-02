'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { LastImportIndicator } from '@/features/import'

const navigation = [
  { name: 'Disponibilidad', href: '/dashboard', icon: 'chart' },
  { name: 'Articulos', href: '/articles', icon: 'box', disabled: true },
  { name: 'Reservas', href: '/reservations', icon: 'calendar' },
  { name: 'Asistente', href: '/chat', icon: 'chat' },
  { name: 'Clientes', href: '/customers', icon: 'users', disabled: true },
  { name: 'Exportar Odoo', href: '/odoo-export', icon: 'odoo' },
  { name: 'Exportar Odoo 19', href: '/odoo19-export', icon: 'odoo19' },
  { name: 'Importar', href: '/import', icon: 'upload', localOnly: true },
]

function NavIcon({ icon }: { icon: string }) {
  const icons: Record<string, React.ReactNode> = {
    chart: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    box: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    calendar: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    users: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    chat: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    upload: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
    odoo: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    odoo19: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" />
      </svg>
    ),
  }
  return <>{icons[icon]}</>
}

export function Sidebar() {
  const pathname = usePathname()
  const [showWarning, setShowWarning] = useState(false)
  const isProduction = process.env.NODE_ENV === 'production'

  const handleLocalOnlyClick = (e: React.MouseEvent) => {
    if (isProduction) {
      e.preventDefault()
      setShowWarning(true)
      setTimeout(() => setShowWarning(false), 5000)
    }
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-20 flex items-center justify-center px-6 border-b border-gray-200 bg-white">
        <Link href="/dashboard" className="w-full">
          <img
            src="/enteza-logo.png"
            alt="ENTEZA"
            className="w-full h-auto max-h-16 object-contain"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1 flex-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href

          if (item.disabled) {
            return (
              <span
                key={item.name}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 cursor-not-allowed"
              >
                <NavIcon icon={item.icon} />
                {item.name}
                <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                  Pronto
                </span>
              </span>
            )
          }

          if (item.localOnly && isProduction) {
            return (
              <button
                key={item.name}
                onClick={handleLocalOnlyClick}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                <NavIcon icon={item.icon} />
                {item.name}
                <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                  Solo local
                </span>
              </button>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
            >
              <NavIcon icon={item.icon} />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Sync Status */}
      <div className="p-4 border-t border-gray-200 flex justify-center">
        <LastImportIndicator />
      </div>

      {/* Warning Toast */}
      {showWarning && (
        <div className="fixed bottom-4 right-4 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg shadow-lg max-w-md animate-slide-up z-50">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-amber-900">Función solo disponible en local</h3>
              <p className="text-sm text-amber-700 mt-1">
                La importación de datos desde SQL Server solo está disponible cuando la aplicación se ejecuta localmente, ya que requiere acceso a las bases de datos internas.
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
