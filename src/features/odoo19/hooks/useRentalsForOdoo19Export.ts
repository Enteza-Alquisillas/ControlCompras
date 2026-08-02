'use client'

import { useCallback, useEffect, useState } from 'react'
import { getRentalsForOdoo19Export } from '../services/rentalsOdoo19ExportService'
import type { Odoo19RentalForExport } from '../types'

export function useRentalsForOdoo19Export(startDate: string, endDate: string) {
  const [rentals, setRentals] = useState<Odoo19RentalForExport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!startDate || !endDate) return
    setIsLoading(true)
    setError(null)
    try {
      setRentals(await getRentalsForOdoo19Export(startDate, endDate))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error cargando pedidos')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { void refetch() }, [refetch])
  return { rentals, isLoading, error, refetch }
}
