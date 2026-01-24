'use client'

import { useState } from 'react'
import { useAvailability } from '../hooks/useAvailability'
import { useFilterStore } from '../store/filterStore'
import { ArticleBreakageSummary } from '../types'
import { StockBreakageRow } from './StockBreakageRow'
import { ArticleDetailModal } from './ArticleDetailModal'
import { DateRangeFilter } from './DateRangeFilter'

export function StockBreakageList() {
  const { startDate, endDate } = useFilterStore()
  const { breakages, isLoading, error, refresh } = useAvailability({
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  })
  const [selectedArticle, setSelectedArticle] = useState<{
    article: ArticleBreakageSummary
    selectedDate: string
  } | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          <p className="text-sm text-gray-500">Calculando disponibilidad...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-800 font-medium">Error al cargar datos</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button
          onClick={refresh}
          className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-md text-sm font-medium transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (breakages.length === 0) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-8 text-center">
        <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-green-800 font-medium text-lg">Sin roturas de stock</p>
        <p className="text-green-600 text-sm mt-1">
          Todos los articulos tienen disponibilidad suficiente
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Roturas de Stock
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {breakages.length} articulos con disponibilidad negativa
            </p>
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <DateRangeFilter />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Articulo
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ventas
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Existencias
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Falta
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sevilla
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jerez
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {breakages.map((breakage) => (
                <StockBreakageRow
                  key={breakage.articleId}
                  breakage={breakage}
                  onClick={() =>
                    setSelectedArticle({
                      article: breakage,
                      selectedDate: breakage.firstBreakageDate,
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <ArticleDetailModal
        article={selectedArticle?.article || null}
        selectedDate={selectedArticle?.selectedDate}
        onClose={() => setSelectedArticle(null)}
      />
    </>
  )
}
