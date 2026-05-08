'use client'

import { useState } from 'react'
import { useRentalsForExport } from '../hooks/useRentalsForExport'
import { useOdooExport } from '../hooks/useOdooExport'
import { RentalsSelectionTable } from './RentalsSelectionTable'
import { ExportSummaryPanel } from './ExportSummaryPanel'
import { ExportResultModal } from './ExportResultModal'

function getDefaultDates(): { startDate: string; endDate: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function OdooExportPage() {
  const defaults = getDefaultDates()
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)

  const { rentals, isLoading, error, refetch } = useRentalsForExport({ startDate, endDate })

  const {
    selectedIds,
    isExporting,
    exportResult,
    isResultModalOpen,
    toggleSelect,
    selectAllPending,
    clearSelection,
    startExport,
    closeResultModal,
  } = useOdooExport(refetch)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exportar a Odoo</h1>
          <p className="text-gray-500 mt-1">
            Selecciona pedidos de alquiler por rango de fechas y créalos como pedidos de venta en Odoo 15.
          </p>
        </div>

        {/* Date range filter */}
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <label htmlFor="startDate" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Desde (fecha evento)
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="endDate" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Hasta (fecha evento)
              </label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Main layout: table + panel */}
        <div className="flex gap-6 items-start">
          {/* Rentals table */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
            <RentalsSelectionTable
              rentals={rentals}
              selectedIds={selectedIds}
              isLoading={isLoading}
              onToggle={toggleSelect}
              onSelectAllPending={() => selectAllPending(rentals)}
              onClearAll={clearSelection}
            />
          </div>

          {/* Export panel */}
          <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 p-6 sticky top-6">
            <ExportSummaryPanel
              selectedIds={selectedIds}
              rentals={rentals}
              isExporting={isExporting}
              onExport={startExport}
              onClear={clearSelection}
            />
          </div>
        </div>
      </div>

      {/* Result modal */}
      {isResultModalOpen && exportResult && (
        <ExportResultModal
          result={exportResult}
          onClose={closeResultModal}
        />
      )}
    </div>
  )
}
