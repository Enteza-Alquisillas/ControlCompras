'use client'

import { useState } from 'react'
import { exportRentalsToOdoo19, unmarkRentalOdoo19Export } from '../actions/odoo19ExportActions'
import type { Odoo19ExportBatchResult, Odoo19RentalForExport } from '../types'

export function useOdoo19Export(refetch: () => Promise<void>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const [result, setResult] = useState<Odoo19ExportBatchResult | null>(null)

  function toggle(id: string): void {
    setSelectedIds((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function exportSelected(): Promise<void> {
    if (selectedIds.size === 0) return
    setIsExporting(true)
    try {
      setResult(await exportRentalsToOdoo19({ rentalIds: [...selectedIds] }))
      setSelectedIds(new Set())
      await refetch()
    } catch (error) {
      setResult({ total: 1, successful: 0, failed: 1, results: [{ rentalId: '', rentalLegacyId: null, customerName: 'N/A', success: false, error: error instanceof Error ? error.message : 'Error de conexión con Odoo 19' }] })
    } finally {
      setIsExporting(false)
    }
  }

  async function unmark(rental: Odoo19RentalForExport): Promise<void> {
    await unmarkRentalOdoo19Export(rental.id)
    await refetch()
  }

  return { selectedIds, isExporting, result, setResult, toggle, setSelectedIds, exportSelected, unmark }
}
