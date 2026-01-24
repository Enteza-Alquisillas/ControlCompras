'use client'

interface AvailabilityBadgeProps {
  deficit: number
  size?: 'sm' | 'md' | 'lg'
}

export function AvailabilityBadge({ deficit, size = 'md' }: AvailabilityBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  const getSeverityClasses = (deficit: number) => {
    if (deficit >= 50) return 'bg-red-100 text-red-800 border-red-200'
    if (deficit >= 20) return 'bg-orange-100 text-orange-800 border-orange-200'
    return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  }

  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full border
        ${sizeClasses[size]}
        ${getSeverityClasses(deficit)}
      `}
    >
      -{deficit}
    </span>
  )
}
