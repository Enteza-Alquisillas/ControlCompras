'use client'

import { useEffect, useRef, useState } from 'react'
import { useArticleDetail } from '../hooks/useArticleDetail'
import { StockBreakage, ArticleReservation } from '../types'

interface ArticleDetailModalProps {
  breakage: StockBreakage | null
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

function getWarehouse(legacyId: number | null): 'Sevilla' | 'Jerez' | '-' {
  if (!legacyId) return '-'
  const idStr = String(legacyId)
  if (idStr.startsWith('41')) return 'Sevilla'
  if (idStr.startsWith('11')) return 'Jerez'
  return '-'
}

export function ArticleDetailModal({ breakage, onClose }: ArticleDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [isYearlyView, setIsYearlyView] = useState(false)

  // Re-using the same hook, it already fetches a wide range by default if we don't pass dates
  const { reservations, isLoading, error } = useArticleDetail(
    breakage?.article_id || null
  )

  // Filter and transform reservations based on view mode
  const displayData = (() => {
    if (!breakage) return { items: [], type: 'daily' as const, totalQuantity: 0, count: 0 }

    if (!isYearlyView) {
      const eventDate = breakage.breakage_date
      const filtered = reservations.filter(
        (r) => r.delivery_date <= eventDate && r.pickup_date >= eventDate
      )

      // Deduplicate by rental_id + quantity
      const seen = new Set<string>()
      const deduped = filtered.filter((r) => {
        const key = `${r.rental_id}_${r.quantity}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      let runningTotal = 0
      const items = deduped.map((r) => {
        runningTotal += r.quantity
        const available = breakage.total_stock - runningTotal
        return {
          ...r,
          runningTotal,
          available,
          isOverbooked: available < 0,
        }
      })

      return { items, type: 'daily' as const, totalQuantity: runningTotal, count: deduped.length }
    } else {
      // Yearly view: Group by date and show evolution
      const groupedByDate: Record<string, { date: string, committed: number, reservations: ArticleReservation[] }> = {}

      reservations.forEach(r => {
        if (!groupedByDate[r.reservation_date]) {
          groupedByDate[r.reservation_date] = { date: r.reservation_date, committed: 0, reservations: [] }
        }
        // Deduplicate reservations per day
        if (!groupedByDate[r.reservation_date].reservations.some(prev => prev.rental_id === r.rental_id)) {
          groupedByDate[r.reservation_date].committed += r.quantity
          groupedByDate[r.reservation_date].reservations.push(r)
        }
      })

      const items = Object.values(groupedByDate)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(day => {
          const available = breakage.total_stock - day.committed
          return {
            ...day,
            available,
            isOverbooked: available < 0,
            hasEventOnDay: day.reservations.some(r => r.event_date === day.date)
          }
        })
        .filter(day => day.isOverbooked && day.hasEventOnDay)

      return { items, type: 'yearly' as const, count: items.length }
    }
  })()

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

  if (!breakage) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-start bg-white sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-900 leading-none">
                {breakage.article_description}
              </h2>
              {isYearlyView && (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                  Previsión Anual <span className="opacity-30 text-[8px]">v3101-1245</span>
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {breakage.article_code && <span className="font-mono bg-gray-100 px-2 rounded mr-2 text-xs">{breakage.article_code}</span>}
              Stock total: <span className="font-bold text-gray-700">{breakage.total_stock}</span>
              <span className="text-gray-300 mx-2">|</span>
              S: {breakage.stock_sevilla} / J: {breakage.stock_jerez}
              {!isYearlyView && (
                <>
                  <span className="text-gray-300 mx-2">|</span>
                  <span className="text-blue-600 font-bold">
                    Evento: {formatDate(breakage.breakage_date)}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {!isYearlyView ? (
              <button
                onClick={() => setIsYearlyView(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-all shadow-sm hover:shadow-md"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                HASTA FINAL DE AÑO
              </button>
            ) : (
              <button
                onClick={() => setIsYearlyView(false)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded text-xs font-bold transition-all"
              >
                RESERVA DEL DÍA
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-sm text-gray-500 font-medium">Calculando evolución de stock...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600 bg-white m-6 rounded-lg border border-red-100 shadow-sm">
              <p className="font-bold">Error al cargar datos</p>
              <p className="text-sm opacity-70">{error}</p>
            </div>
          ) : displayData.items.length === 0 ? (
            <div className="text-center py-20 text-gray-400 italic bg-white m-6 rounded-lg border border-dashed border-gray-200">
              No hay reservas registradas para este periodo.
            </div>
          ) : (
            <div className="p-6">
              <table className="w-full text-xs">
                {displayData.type === 'daily' ? (
                  <>
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-100 text-[#1A3A8A] font-bold">
                        <th className="text-left py-2 px-3 uppercase w-20">Almacen</th>
                        <th className="text-left py-2 px-3 uppercase">Evento</th>
                        <th className="text-left py-2 px-3 uppercase">Cliente</th>
                        <th className="text-left py-2 px-3 uppercase">Lugar</th>
                        <th className="text-center py-2 px-3 uppercase w-16">Uds.</th>
                        <th className="text-center py-2 px-3 uppercase w-20">Acumulado</th>
                        <th className="text-center py-2 px-3 uppercase w-20">Disponible</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {(displayData.items as any[]).map((r) => (
                        <tr key={r.rental_id} className={`border-b border-gray-100 hover:bg-blue-50/50 ${r.isOverbooked ? 'bg-red-50/50' : ''}`}>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getWarehouse(r.rental_legacy_id) === 'Sevilla' ? 'bg-orange-100 text-orange-700' :
                              getWarehouse(r.rental_legacy_id) === 'Jerez' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                              }`}>
                              {getWarehouse(r.rental_legacy_id).toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-gray-900">{r.event_date ? formatDate(r.event_date) : 'S/F'}</div>
                            <div className="text-[9px] text-gray-400 font-medium">E: {formatDate(r.delivery_date)} / R: {formatDate(r.pickup_date)}</div>
                          </td>
                          <td className="py-2 px-3 text-gray-700 truncate max-w-[150px]" title={r.customer_name}>{r.customer_name}</td>
                          <td className="py-2 px-3 text-gray-500 truncate max-w-[150px]" title={r.delivery_address || ''}>{r.delivery_address || '-'}</td>
                          <td className="py-2 px-3 text-center font-bold text-gray-900">{r.quantity}</td>
                          <td className="py-2 px-3 text-center text-gray-600">{r.runningTotal}</td>
                          <td className="py-2 px-3 text-center font-black">
                            <span className={r.isOverbooked ? 'text-red-600' : 'text-green-600'}>{r.available}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-100 text-[#1A3A8A] font-bold sticky top-0">
                        <th className="text-left py-2 px-3 uppercase">Fecha</th>
                        <th className="text-left py-2 px-3 uppercase">Estado de Unidades</th>
                        <th className="text-left py-2 px-3 uppercase">Pedidos Activos</th>
                        <th className="text-center py-2 px-3 uppercase w-20">Alquilado</th>
                        <th className="text-center py-2 px-3 uppercase w-20">Disponible</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {(displayData.items as any[]).map((day) => (
                        <tr key={day.date} className={`hover:bg-blue-50/50 ${day.isOverbooked ? 'bg-red-50/30' : ''}`}>
                          <td className="py-2 px-3 whitespace-nowrap font-bold text-gray-900">
                            {formatDate(day.date)}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex h-1.5 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-200 max-w-[120px]">
                              <div
                                className={`h-full ${day.isOverbooked ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(100, (day.committed / breakage.total_stock) * 100)}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-2 px-3 text-[10px] text-gray-500 max-w-[200px] truncate" title={day.reservations.map((res: any) => `${res.customer_name} (${res.quantity})`).join(', ')}>
                            {day.reservations.length} pedidos: {day.reservations.slice(0, 2).map((res: any) => res.customer_name.split(' ')[0]).join(', ')}{day.reservations.length > 2 ? '...' : ''}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-gray-900">{day.committed}</td>
                          <td className="py-2 px-3 text-center font-black">
                            <span className={day.isOverbooked ? 'text-red-600' : 'text-green-600'}>{day.available}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white">
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-500 font-medium">
              <span>{displayData.count} {displayData.type === 'daily' ? 'reservas activas' : 'alertas de sobreventa encontradas'}</span>
              {displayData.type === 'daily' && (
                <>
                  <span className="mx-2 text-gray-300">|</span>
                  <span>Total comprometido: <span className="font-bold text-gray-900">{displayData.totalQuantity}</span></span>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-[#1A3A8A] hover:bg-blue-900 text-white rounded-lg text-sm font-bold transition-all shadow-sm"
            >
              Cerrar Ventana
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
