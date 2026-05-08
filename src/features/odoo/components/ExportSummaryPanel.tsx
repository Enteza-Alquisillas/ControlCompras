'use client'

import type { RentalForExport } from '../types'

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

interface ExportSummaryPanelProps {
  selectedIds: Set<string>
  rentals: RentalForExport[]
  isExporting: boolean
  onExport: () => void
  onClear: () => void
}

export function ExportSummaryPanel({
  selectedIds,
  rentals,
  isExporting,
  onExport,
  onClear,
}: ExportSummaryPanelProps) {
  const selectedRentals = rentals.filter((r) => selectedIds.has(r.id))
  const totalItems = selectedRentals.reduce((sum, r) => sum + r.itemCount, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Exportar a Odoo
        </h2>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-3xl font-bold text-gray-900">{selectedIds.size}</span>
          <span className="text-gray-500 text-sm">
            pedido{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
        </div>
        {totalItems > 0 && (
          <p className="text-xs text-gray-400 mt-0.5">{totalItems} líneas en total</p>
        )}
      </div>

      {/* Selected rentals preview */}
      {selectedRentals.length > 0 && (
        <div className="flex-1 overflow-y-auto max-h-72 space-y-1.5">
          {selectedRentals.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between p-2.5 bg-blue-50 rounded-lg text-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {r.customer?.name ?? <span className="italic text-gray-400">Sin cliente</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {r.event_date ? formatDate(r.event_date) : '—'}
                  {r.legacy_id ? ` · #${r.legacy_id}` : ''}
                </p>
              </div>
              <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded font-medium shrink-0">
                {r.itemCount} art.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {selectedIds.size === 0 && (
        <div className="py-6 text-center">
          <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm text-gray-400">
            Selecciona pedidos de la lista para exportarlos a Odoo
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-2 mt-auto">
        <button
          onClick={onExport}
          disabled={selectedIds.size === 0 || isExporting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isExporting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Exportando...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Exportar a Odoo
            </>
          )}
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={onClear}
            disabled={isExporting}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Limpiar selección
          </button>
        )}
      </div>

      {/* Info note */}
      <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
        Los pedidos ya exportados (en verde) no pueden volver a exportarse.
      </p>
    </div>
  )
}
