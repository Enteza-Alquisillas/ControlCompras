'use client'

import { ArticleBreakageSummary } from '../types'
import { AvailabilityBadge } from './AvailabilityBadge'

interface StockBreakageRowProps {
  breakage: ArticleBreakageSummary
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
  return (
    <tr
      onClick={onClick}
      className="hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100"
    >
      {/* Fecha primera rotura */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm font-medium text-gray-900">
          {formatDate(breakage.firstBreakageDate)}
        </span>
        {breakage.breakageDates.length > 1 && (
          <span className="ml-2 text-xs text-gray-500">
            (+{breakage.breakageDates.length - 1} dias)
          </span>
        )}
      </td>

      {/* Articulo */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900">
            {breakage.articleDescription}
          </span>
          {breakage.articleCode && (
            <span className="text-xs text-gray-500">
              Cod: {breakage.articleCode}
            </span>
          )}
        </div>
      </td>

      {/* Ventas (comprometido) */}
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-semibold text-gray-900">
          {breakage.maxCommitted}
        </span>
      </td>

      {/* Existencias (stock total) */}
      <td className="px-4 py-3 text-center">
        <span className="text-sm text-gray-700">
          {breakage.totalStock}
        </span>
      </td>

      {/* Falta (deficit) */}
      <td className="px-4 py-3 text-center">
        <AvailabilityBadge deficit={breakage.maxDeficit} />
      </td>

      {/* Stock Sevilla */}
      <td className="px-4 py-3 text-center">
        <span className="text-sm text-gray-600">
          {breakage.stockSevilla}
        </span>
      </td>

      {/* Stock Jerez */}
      <td className="px-4 py-3 text-center">
        <span className="text-sm text-gray-600">
          {breakage.stockJerez}
        </span>
      </td>
    </tr>
  )
}
