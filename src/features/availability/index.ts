// Components
export { StockBreakageList } from './components/StockBreakageList'
export { StockBreakageRow } from './components/StockBreakageRow'
export { ArticleDetailModal } from './components/ArticleDetailModal'
export { AvailabilityBadge } from './components/AvailabilityBadge'
export { DateRangeFilter } from './components/DateRangeFilter'

// Hooks
export { useAvailability } from './hooks/useAvailability'
export { useArticleDetail } from './hooks/useArticleDetail'
export { useStockStats } from './hooks/useStockStats'

// Services
export { availabilityService } from './services/availabilityService'

// Types
export type {
  StockBreakage,
  ArticleReservation,
  ArticleBreakageSummary,
  AvailabilityFilters,
  DateRangePreset,
} from './types'
