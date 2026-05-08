'use client'

import { useState, useCallback } from 'react'
import { exportRentalsToOdoo } from '../actions/odooExportActions'
import type { OdooExportBatchResult, RentalForExport } from '../types'

interface UseOdooExportResult {
  selectedIds: Set<string>
  isExporting: boolean
  exportResult: OdooExportBatchResult | null
  isResultModalOpen: boolean
  toggleSelect: (id: string) => void
  selectAllPending: (rentals: RentalForExport[]) => void
  clearSelection: () => void
  startExport: () => Promise<void>
  closeResultModal: () => void
}

export function useOdooExport(onSuccess: () => void): UseOdooExportResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<OdooExportBatchResult | null>(null)
  const [isResultModalOpen, setIsResultModalOpen] = useState(false)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const selectAllPending = useCallback((visibleRentals: RentalForExport[]) => {
    const ids = visibleRentals
      .filter((r) => r.odoo_order_id === null)
      .map((r) => r.id)
    setSelectedIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const startExport = useCallback(async () => {
    if (selectedIds.size === 0) return
    setIsExporting(true)
    try {
      const result = await exportRentalsToOdoo({ rentalIds: Array.from(selectedIds) })
      setExportResult(result)
      setIsResultModalOpen(true)
      setSelectedIds(new Set())
      onSuccess()
    } catch (e) {
      setExportResult({
        total: 0,
        successful: 0,
        failed: 1,
        results: [
          {
            rentalId: '',
            rentalLegacyId: null,
            customerName: 'N/A',
            success: false,
            error: e instanceof Error ? e.message : 'Error de conexión con Odoo',
          },
        ],
      })
      setIsResultModalOpen(true)
    } finally {
      setIsExporting(false)
    }
  }, [selectedIds, onSuccess])

  const closeResultModal = useCallback(() => {
    setIsResultModalOpen(false)
    setExportResult(null)
  }, [])

  return {
    selectedIds,
    isExporting,
    exportResult,
    isResultModalOpen,
    toggleSelect,
    selectAllPending,
    clearSelection,
    startExport,
    closeResultModal,
  }
}
