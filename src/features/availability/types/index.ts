import { StockBreakage, ArticleReservation } from '@/lib/supabase/database.types'

// Re-export from database types
export type { StockBreakage, ArticleReservation }

// Grouped breakages by article (for the main list)
export interface ArticleBreakageSummary {
  articleId: string
  articleCode: string | null
  articleDescription: string
  firstBreakageDate: string
  totalStock: number
  maxCommitted: number
  maxDeficit: number
  stockSevilla: number
  stockJerez: number
  breakageDates: string[]
}

// Filters for the availability query
export interface AvailabilityFilters {
  startDate?: string
  endDate?: string
}

// Date range presets
export type DateRangePreset =
  | 'this_month'
  | 'next_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom'
