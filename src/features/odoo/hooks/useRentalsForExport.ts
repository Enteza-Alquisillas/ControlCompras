'use client'

import { useState, useEffect, useCallback } from 'react'
import { getRentalsForExportBrowser } from '../services/rentalsExportService'
import type { RentalForExport } from '../types'

interface UseRentalsForExportOptions {
  startDate: string
  endDate: string
}

interface UseRentalsForExportResult {
  rentals: RentalForExport[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useRentalsForExport({
  startDate,
  endDate,
}: UseRentalsForExportOptions): UseRentalsForExportResult {
  const [rentals, setRentals] = useState<RentalForExport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!startDate || !endDate) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await getRentalsForExportBrowser(startDate, endDate)
      setRentals(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando pedidos')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    load()
  }, [load])

  return { rentals, isLoading, error, refetch: load }
}
