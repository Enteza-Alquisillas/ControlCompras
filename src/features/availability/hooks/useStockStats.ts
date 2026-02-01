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

interface UseStockStatsProps {
  startDate?: string
  endDate?: string
}

export function useStockStats(props?: UseStockStatsProps): UseStockStatsReturn {
  const [stats, setStats] = useState<StockStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // 1. Total active articles (cached count is fine here)
      const { count: totalArticles, error: articlesError } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      if (articlesError) throw articlesError

      // 2. Articles with breakage (using OPTIMIZED RPC function)
      const args: Record<string, string> = {}
      if (props?.startDate) args.start_date = props.startDate
      if (props?.endDate) args.end_date = props.endDate

      const { data: breakages, error: breakagesError } = await (supabase as any).rpc(
        'get_stock_breakages_optimized',
        Object.keys(args).length > 0 ? args : undefined
      )

      if (breakagesError) throw breakagesError

      // Count unique articles with breakage
      const uniqueArticlesWithBreakage = new Set(
        (breakages || []).map((b: { article_id: string }) => b.article_id)
      ).size

      // Find next breakage date (they come sorted by date from optimized RPC)
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
  }, [props?.startDate, props?.endDate])

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
