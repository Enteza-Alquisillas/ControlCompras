import { createClient } from '@/lib/supabase/client'
import { StockBreakage, ArticleReservation, ArticleBreakageSummary } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient> & { rpc: (fn: string, args?: Record<string, unknown>) => any }

export const availabilityService = {
  /**
   * Get all stock breakages (items with negative availability)
   * Uses optimized function (10-50x faster than previous version)
   */
  async getStockBreakages(
    startDate?: string,
    endDate?: string
  ): Promise<StockBreakage[]> {
    const supabase = createClient() as SupabaseClient

    const args: Record<string, string> = {}
    if (startDate) args.start_date = startDate
    if (endDate) args.end_date = endDate

    const { data, error } = await supabase.rpc(
      'get_stock_breakages_optimized',
      Object.keys(args).length > 0 ? args : undefined
    )

    if (error) {
      console.error('Error fetching stock breakages:', error)
      throw new Error(error.message)
    }

    return (data as StockBreakage[]) || []
  },

  /**
   * Get reservations for a specific article
   * Uses optimized function (generates dates only within rental ranges)
   */
  async getArticleReservations(
    articleId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ArticleReservation[]> {
    const supabase = createClient() as SupabaseClient

    const args: Record<string, string> = { p_article_id: articleId }
    if (startDate) args.start_date = startDate
    if (endDate) args.end_date = endDate

    const { data, error } = await supabase.rpc('get_article_reservations_optimized', args)

    if (error) {
      console.error('Error fetching article reservations:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      console.error('Error message:', error.message)
      console.error('Error code:', error.code)
      throw new Error(error.message || 'Unknown error fetching reservations')
    }

    return (data as ArticleReservation[]) || []
  },

  /**
   * Group breakages by article for the summary list
   * Shows first breakage date and worst deficit for each article
   */
  groupBreakagesByArticle(breakages: StockBreakage[]): ArticleBreakageSummary[] {
    const grouped = new Map<string, ArticleBreakageSummary>()

    for (const breakage of breakages) {
      const existing = grouped.get(breakage.article_id)

      if (!existing) {
        grouped.set(breakage.article_id, {
          articleId: breakage.article_id,
          articleCode: breakage.article_code,
          articleDescription: breakage.article_description,
          firstBreakageDate: breakage.breakage_date,
          totalStock: breakage.total_stock,
          maxCommitted: breakage.committed,
          maxDeficit: Math.abs(breakage.available),
          stockSevilla: breakage.stock_sevilla,
          stockJerez: breakage.stock_jerez,
          breakageDates: [breakage.breakage_date],
        })
      } else {
        // Update with worse values
        if (breakage.breakage_date < existing.firstBreakageDate) {
          existing.firstBreakageDate = breakage.breakage_date
        }
        if (breakage.committed > existing.maxCommitted) {
          existing.maxCommitted = breakage.committed
        }
        if (Math.abs(breakage.available) > existing.maxDeficit) {
          existing.maxDeficit = Math.abs(breakage.available)
        }
        existing.breakageDates.push(breakage.breakage_date)
      }
    }

    // Sort by first breakage date
    return Array.from(grouped.values()).sort(
      (a, b) => a.firstBreakageDate.localeCompare(b.firstBreakageDate)
    )
  },
}
