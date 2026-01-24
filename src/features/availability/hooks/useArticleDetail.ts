'use client'

import { useState, useEffect, useCallback } from 'react'
import { availabilityService } from '../services/availabilityService'
import { ArticleReservation } from '../types'

interface UseArticleDetailReturn {
  reservations: ArticleReservation[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useArticleDetail(
  articleId: string | null,
  startDate?: string,
  endDate?: string
): UseArticleDetailReturn {
  const [reservations, setReservations] = useState<ArticleReservation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReservations = useCallback(async () => {
    if (!articleId) {
      setReservations([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await availabilityService.getArticleReservations(
        articleId,
        startDate,
        endDate
      )
      setReservations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }, [articleId, startDate, endDate])

  useEffect(() => {
    fetchReservations()
  }, [fetchReservations])

  return {
    reservations,
    isLoading,
    error,
    refresh: fetchReservations,
  }
}
