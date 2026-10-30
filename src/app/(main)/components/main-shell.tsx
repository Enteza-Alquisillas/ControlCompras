'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'

const STORAGE_KEY = 'sidebar-collapsed'

export function MainShell({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // sin localStorage la barra arranca expandida
    }
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // la preferencia solo vive en esta sesión
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <div className={`transition-[padding] duration-200 ${collapsed ? 'pl-16' : 'pl-64'}`}>
        {header}
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
