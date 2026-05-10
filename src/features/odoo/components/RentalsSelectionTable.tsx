'use client'

import type { RentalForExport } from '../types'

interface RentalsSelectionTableProps {
  rentals: RentalForExport[]
  selectedIds: Set<string>
  isLoading: boolean
  onToggle: (id: string) => void
  onSelectAllPending: () => void
  onClearAll: () => void
  onRequestUnmark: (rental: RentalForExport) => void
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

export function RentalsSelectionTable({
  rentals,
  selectedIds,
  isLoading,
  onToggle,
  onSelectAllPending,
  onClearAll,
  onRequestUnmark,
}: RentalsSelectionTableProps) {
  const pendingCount = rentals.filter((r) => r.odoo_order_id === null).length

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (rentals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-gray-500 font-medium">No hay pedidos en el rango seleccionado</p>
        <p className="text-gray-400 text-sm mt-1">Ajusta las fechas para ver pedidos</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Bulk action bar */}
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={onSelectAllPending}
          disabled={pendingCount === 0}
          className="text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          Seleccionar pendientes ({pendingCount})
        </button>
        {selectedIds.size > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <button
              onClick={onClearAll}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              Limpiar selección
            </button>
          </>
        )}
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Evento
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Entrega
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Cliente
              </th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Arts.
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Odoo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rentals.map((rental) => {
              const isExported = rental.odoo_order_id !== null
              const isSelected = selectedIds.has(rental.id)

              return (
                <tr
                  key={rental.id}
                  onClick={() => !isExported && onToggle(rental.id)}
                  className={`group transition-colors ${
                    isExported
                      ? 'bg-green-50 cursor-default'
                      : isSelected
                      ? 'bg-blue-50 cursor-pointer hover:bg-blue-100'
                      : 'bg-white cursor-pointer hover:bg-gray-50'
                  }`}
                >
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isExported}
                      onChange={() => !isExported && onToggle(rental.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {rental.event_date ? formatDate(rental.event_date) : '—'}
                    {rental.legacy_id && (
                      <div className="text-xs text-gray-400 font-normal">#{rental.legacy_id}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(rental.delivery_date)}
                  </td>
                  <td className="px-3 py-3 text-gray-700 max-w-[180px]">
                    <span className="truncate block" title={rental.customer?.name ?? '—'}>
                      {rental.customer?.name ?? <span className="text-gray-400 italic">Sin cliente</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                      {rental.itemCount}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {isExported ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          #{rental.odoo_order_id}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onRequestUnmark(rental) }}
                          title="Quitar marca de exportación"
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Pendiente</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        {rentals.length} pedido{rentals.length !== 1 ? 's' : ''} en el rango
        {' · '}
        {rentals.filter((r) => r.odoo_order_id !== null).length} exportado{rentals.filter((r) => r.odoo_order_id !== null).length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
