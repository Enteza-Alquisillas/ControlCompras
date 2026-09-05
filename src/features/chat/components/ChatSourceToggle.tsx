'use client'

import type { ChatSource } from '../types'

interface ChatSourceToggleProps {
  source: ChatSource
  onChange: (source: ChatSource) => void
  disabled?: boolean
}

const OPTIONS: Array<{ value: ChatSource; label: string }> = [
  { value: 'machu', label: 'Machu' },
  { value: 'odoo', label: 'Odoo' },
]

export function ChatSourceToggle({ source, onChange, disabled }: ChatSourceToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5" role="tablist" aria-label="Fuente de datos">
      {OPTIONS.map((option) => {
        const isActive = option.value === source
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive
                ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
