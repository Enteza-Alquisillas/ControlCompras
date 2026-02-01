'use client'

import { StockBreakage } from '../types'
import { AvailabilityBadge } from './AvailabilityBadge'

interface StockBreakageRowProps {
  breakage: StockBreakage
  onClick: () => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function StockBreakageRow({ breakage, onClick }: StockBreakageRowProps) {
  const deficit = Math.abs(breakage.available)

  return (
    <tr
      onClick={onClick}
      className="hover:bg-blue-50 cursor-pointer transition-colors even:bg-gray-50"
    >
      {/* Fecha evento (breakage_date) */}
      <td className="px-3 py-0.5 whitespace-nowrap">
        <span className="text-sm font-medium text-gray-900">
          {formatDate(breakage.breakage_date)}
        </span>
      </td>

      {/* Articulo */}
      <td className="px-3 py-0.5">
        <span className="text-sm font-medium text-gray-900">
          {breakage.article_description}
          {breakage.article_code && (
            <span className="text-gray-400 ml-2">{breakage.article_code}</span>
          )}
        </span>
      </td>

      {/* Ventas (comprometido) */}
      <td className="px-3 py-0.5 text-center">
        <span className="text-sm font-semibold text-gray-900">
          {breakage.committed}
        </span>
      </td>

      {/* Existencias (stock total) */}
      <td className="px-3 py-0.5 text-center">
        <span className="text-sm text-gray-700">
          {breakage.total_stock}
        </span>
      </td>

      {/* Falta (deficit) */}
      <td className="px-3 py-0.5 text-center">
        <AvailabilityBadge deficit={deficit} />
      </td>

      {/* Salidas del día */}
      <td className="px-3 py-0.5 text-center">
        <span className="text-sm font-medium text-blue-600">
          {(breakage as any).event_day_committed || 0}
        </span>
      </td>

      {/* Stock Sevilla */}
      <td className="px-3 py-0.5 text-center">
        <span className="text-sm text-gray-600">
          {breakage.stock_sevilla}
        </span>
      </td>

      {/* Stock Jerez */}
      <td className="px-3 py-0.5 text-center">
        <span className="text-sm text-gray-600">
          {breakage.stock_jerez}
        </span>
      </td>
    </tr>
  )
}
