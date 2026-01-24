'use client'

import { useState, useEffect, useCallback } from 'react'
import { availabilityService } from '../services/availabilityService'
import { StockBreakage, AvailabilityFilters } from '../types'

interface UseAvailabilityReturn {
  breakages: StockBreakage[]
  isLoading: boolean
  error: string | null
  filters: AvailabilityFilters
  setFilters: (filters: AvailabilityFilters) => void
  refresh: () => Promise<void>
}

export function useAvailability(
  initialFilters?: AvailabilityFilters
): UseAvailabilityReturn {
  const [breakages, setBreakages] = useState<StockBreakage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AvailabilityFilters>(
    initialFilters || {}
  )

  const fetchBreakages = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Don't group - show each breakage date separately for accurate detail view
      const rawBreakages = await availabilityService.getStockBreakages(
        filters.startDate,
        filters.endDate
      )
      setBreakages(rawBreakages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }, [filters.startDate, filters.endDate])

  useEffect(() => {
    fetchBreakages()
  }, [fetchBreakages])

  return {
    breakages,
    isLoading,
    error,
    filters,
    setFilters,
    refresh: fetchBreakages,
  }
}
