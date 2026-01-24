'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface StockStats {
  totalArticles: number
  articlesWithBreakage: number
  articlesWithoutBreakage: number
  nextBreakageDate: string | null
}

interface UseStockStatsReturn {
  stats: StockStats | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useStockStats(): UseStockStatsReturn {
  const [stats, setStats] = useState<StockStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // 1. Total active articles
      const { count: totalArticles, error: articlesError } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      if (articlesError) throw articlesError

      // 2. Articles with breakage (using RPC function)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: breakages, error: breakagesError } = await (supabase as any).rpc(
        'get_stock_breakages',
        {
          start_date: new Date().toISOString().split('T')[0],
          end_date: '2026-12-31'
        }
      )

      if (breakagesError) throw breakagesError

      // Count unique articles with breakage
      const uniqueArticlesWithBreakage = new Set(
        (breakages || []).map((b: { article_id: string }) => b.article_id)
      ).size

      // Find next breakage date
      const nextBreakageDate =
        breakages && breakages.length > 0
          ? breakages[0].breakage_date
          : null

      setStats({
        totalArticles: totalArticles || 0,
        articlesWithBreakage: uniqueArticlesWithBreakage,
        articlesWithoutBreakage: (totalArticles || 0) - uniqueArticlesWithBreakage,
        nextBreakageDate,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return {
    stats,
    isLoading,
    error,
    refresh: fetchStats,
  }
}
