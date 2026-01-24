'use client'

import { useState, useEffect, useCallback } from 'react'
import { availabilityService } from '../services/availabilityService'
import { ArticleBreakageSummary, AvailabilityFilters } from '../types'

interface UseAvailabilityReturn {
  breakages: ArticleBreakageSummary[]
  isLoading: boolean
  error: string | null
  filters: AvailabilityFilters
  setFilters: (filters: AvailabilityFilters) => void
  refresh: () => Promise<void>
}

export function useAvailability(
  initialFilters?: AvailabilityFilters
): UseAvailabilityReturn {
  const [breakages, setBreakages] = useState<ArticleBreakageSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AvailabilityFilters>(
    initialFilters || {}
  )

  const fetchBreakages = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const rawBreakages = await availabilityService.getStockBreakages(
        filters.startDate,
        filters.endDate
      )
      const grouped = availabilityService.groupBreakagesByArticle(rawBreakages)
      setBreakages(grouped)
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
