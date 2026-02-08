'use client'

import { StockBreakageList, useStockStats, DateRangeFilter } from '@/features/availability'
import { useFilterStore } from '@/features/availability/store/filterStore'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function DashboardPage() {
  const { startDate, endDate } = useFilterStore()
  const { stats, isLoading } = useStockStats({
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  })

  const nextBreakageLabel = stats?.nextBreakageDate
    ? format(new Date(stats.nextBreakageDate), "d 'de' MMMM", { locale: es })
    : 'Sin roturas'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">
            Control de Disponibilidad
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Vista global de sobreventas y estado de inventario
          </p>
        </div>
        <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-100">
          <DateRangeFilter />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-xl">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Catálogo</p>
              <p className="text-2xl font-bold text-gray-900">
                {isLoading ? (
                  <span className="inline-block w-8 h-6 bg-gray-100 animate-pulse rounded"></span>
                ) : (
                  stats?.totalArticles || 0
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-50 rounded-xl">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Disponibles</p>
              <p className="text-2xl font-bold text-green-600">
                {isLoading ? (
                  <span className="inline-block w-8 h-6 bg-gray-100 animate-pulse rounded"></span>
                ) : (
                  stats?.articlesWithoutBreakage || 0
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${stats?.articlesWithBreakage ? 'bg-red-50' : 'bg-gray-50'}`}>
              <svg className={`w-6 h-6 ${stats?.articlesWithBreakage ? 'text-red-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Con Rotura</p>
              <p className={`text-2xl font-bold ${stats?.articlesWithBreakage ? 'text-red-600' : 'text-gray-900'}`}>
                {isLoading ? (
                  <span className="inline-block w-8 h-6 bg-gray-100 animate-pulse rounded"></span>
                ) : (
                  stats?.articlesWithBreakage || 0
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 rounded-xl">
              <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Próxima Rotura</p>
              <p className={`text-lg font-bold truncate max-w-[120px] ${stats?.nextBreakageDate ? 'text-amber-700' : 'text-gray-400'}`}>
                {isLoading ? (
                  <span className="inline-block w-16 h-6 bg-gray-100 animate-pulse rounded"></span>
                ) : (
                  nextBreakageLabel
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content: Stock breakage list */}
      <StockBreakageList />
    </div>
  )
}
