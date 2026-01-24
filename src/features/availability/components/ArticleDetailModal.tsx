'use client'

import { useEffect, useRef } from 'react'
import { useArticleDetail } from '../hooks/useArticleDetail'
import { ArticleBreakageSummary } from '../types'

interface ArticleDetailModalProps {
  article: ArticleBreakageSummary | null
  onClose: () => void
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function ArticleDetailModal({ article, onClose }: ArticleDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const { reservations, isLoading, error } = useArticleDetail(
    article?.articleId || null
  )

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  if (!article) return null

  // Calculate running totals for display
  let runningTotal = 0
  const reservationsWithTotals = reservations.map((r) => {
    runningTotal += r.quantity
    const available = article.totalStock - runningTotal
    return {
      ...r,
      runningTotal,
      available,
      isOverbooked: available < 0,
    }
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {article.articleDescription}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {article.articleCode && `Codigo: ${article.articleCode} · `}
              Stock total: {article.totalStock} unidades
              (Sevilla: {article.stockSevilla} / Jerez: {article.stockJerez})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">
              Error: {error}
            </div>
          ) : reservations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No hay reservas para este articulo
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Evento
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Cliente
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Lugar
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Uds.
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Acumulado
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Disponible
                  </th>
                </tr>
              </thead>
              <tbody>
                {reservationsWithTotals.map((r, idx) => (
                  <tr
                    key={r.rental_id + idx}
                    className={`border-b border-gray-100 ${r.isOverbooked ? 'bg-red-50' : ''
                      }`}
                  >
                    <td className="py-2 px-3 text-sm">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">
                          {r.event_date ? formatDate(r.event_date) : 'Sin fecha'}
                        </span>
                        <div className="flex gap-1 text-[10px] text-gray-400">
                          <span>E: {formatDate(r.delivery_date)}</span>
                          <span>R: {formatDate(r.pickup_date)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-sm text-gray-900">
                      {r.customer_name}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500 truncate max-w-[150px]" title={r.delivery_address || ''}>
                      {r.delivery_address || '-'}
                    </td>
                    <td className="py-2 px-3 text-sm text-center font-medium text-gray-900">
                      {r.quantity}
                    </td>
                    <td className="py-2 px-3 text-sm text-center text-gray-600">
                      {r.runningTotal}
                    </td>
                    <td className="py-2 px-3 text-sm text-center">
                      <span
                        className={`font-semibold ${r.isOverbooked ? 'text-red-600' : 'text-green-600'
                          }`}
                      >
                        {r.available}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {reservations.length} reservas encontradas
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md text-sm font-medium transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
