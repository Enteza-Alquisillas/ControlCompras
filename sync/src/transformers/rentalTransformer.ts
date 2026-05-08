import { Warehouse } from '../config.js'
import { RentalLegacy, TransformedRental, TransformedRentalItem } from '../types/index.js'
import { isExcludedCustomer } from './customerTransformer.js'

export interface RentalTransformResult {
  rentals: TransformedRental[]
  skippedCustomerNotFound: number
  skippedExcluded: number
  skippedInvalidDates: number
  dateWarnings: string[]
}

/**
 * Converts a SQL Server date value (Date object or string) to 'YYYY-MM-DD'.
 * Uses local date parts to avoid UTC timezone shift for dates stored as midnight.
 * Returns null if the value is null/undefined/invalid.
 */
function toDateString(value: unknown): string | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value as string)
  if (isNaN(d.getTime())) return null
  // Use local year/month/day to avoid UTC shift (SQL Server midnight in Spain → UTC previous day)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Clamp a date string to be within [min, max].
 * If value is outside range, returns the nearest bound and logs a warning.
 */
function clampDate(value: string, min: string, max: string): { date: string; clamped: boolean } {
  if (value < min) return { date: min, clamped: true }
  if (value > max) return { date: max, clamped: true }
  return { date: value, clamped: false }
}

/**
 * Transform legacy rentals to Supabase format.
 * Groups by ID_EVENTO to get unique headers.
 * Validates and sanitizes all dates to satisfy the valid_dates constraint:
 *   - delivery_date <= pickup_date
 *   - event_date BETWEEN delivery_date AND pickup_date
 */
export function transformRentals(
  legacyData: RentalLegacy[],
  warehouseId: string,
  customerMap: Record<number, string>,
  excludedCustomerIds?: Set<number>
): RentalTransformResult {
  const uniqueHeadersMap = new Map<number, TransformedRental>()
  let skippedCustomerNotFound = 0
  let skippedExcluded = 0
  let skippedInvalidDates = 0
  const dateWarnings: string[] = []

  legacyData.forEach((item) => {
    if (uniqueHeadersMap.has(item.ID_EVENTO)) return

    if (isExcludedCustomer(item.ID_CLIENTE, excludedCustomerIds)) {
      skippedExcluded++
      return
    }

    const customerId = customerMap[item.ID_CLIENTE]
    if (!customerId) {
      skippedCustomerNotFound++
      return
    }

    const deliveryDate = toDateString(item.FECHA_ENTREGA)
    const pickupDate = toDateString(item.FECHA_RECOLECTA)
    const rawEventDate = toDateString(item.FECHA_EVENTO)

    // Skip rentals with missing required dates
    if (!deliveryDate || !pickupDate) {
      skippedInvalidDates++
      dateWarnings.push(
        `ID_EVENTO ${item.ID_EVENTO}: skipped — null dates (ENTREGA=${item.FECHA_ENTREGA}, RECOLECTA=${item.FECHA_RECOLECTA})`
      )
      return
    }

    // Skip rentals where delivery is after pickup (violates valid_dates)
    if (deliveryDate > pickupDate) {
      skippedInvalidDates++
      dateWarnings.push(
        `ID_EVENTO ${item.ID_EVENTO}: skipped — delivery (${deliveryDate}) > pickup (${pickupDate})`
      )
      return
    }

    // Clamp event_date to [delivery_date, pickup_date].
    // Some legacy records have FECHA_EVENTO outside the rental period due to data entry errors.
    const baseEventDate = rawEventDate ?? deliveryDate
    const { date: eventDate, clamped } = clampDate(baseEventDate, deliveryDate, pickupDate)
    if (clamped) {
      dateWarnings.push(
        `ID_EVENTO ${item.ID_EVENTO}: event_date clamped from ${baseEventDate} to ${eventDate} (range ${deliveryDate}–${pickupDate})`
      )
    }

    uniqueHeadersMap.set(item.ID_EVENTO, {
      legacy_id: item.ID_EVENTO,
      customer_id: customerId,
      warehouse_id: warehouseId,
      delivery_address: item.LUGAR_DESCRIPCION,
      event_date: eventDate,
      delivery_date: deliveryDate,
      pickup_date: pickupDate,
      status: item.STATUS || 'confirmed',
      notes: item.NOTAS,
    })
  })

  return {
    rentals: Array.from(uniqueHeadersMap.values()),
    skippedCustomerNotFound,
    skippedExcluded,
    skippedInvalidDates,
    dateWarnings,
  }
}

export interface RentalItemsTransformResult {
  items: TransformedRentalItem[]
  skipped: number
}

/**
 * Transform legacy rental details to Supabase format
 */
export function transformRentalItems(
  legacyData: RentalLegacy[],
  warehouse: Warehouse,
  rentalIdMap: Record<number, string>,
  articleMap: Record<number, string>
): RentalItemsTransformResult {
  let skipped = 0

  const items = legacyData
    .map((item) => {
      const rentalId = rentalIdMap[item.ID_EVENTO]
      const articleId = articleMap[item.ID_MATERIAL]

      if (!rentalId || !articleId) {
        skipped++
        return null
      }

      return {
        rental_id: rentalId,
        article_id: articleId,
        quantity: item.CANTIDAD,
        notes: item.NOTAS_ITEM,
      }
    })
    .filter((ri): ri is TransformedRentalItem => ri !== null)

  return { items, skipped }
}

/**
 * Build article map for a specific warehouse
 */
export function buildArticleMap(
  articles: Array<{
    id: string
    legacy_id: number
    legacy_id_sevilla: number | null
    legacy_id_jerez: number | null
  }>,
  warehouse: Warehouse
): Record<number, string> {
  const map: Record<number, string> = {}

  articles.forEach((a) => {
    const legacyId =
      warehouse === 'SEVILLA'
        ? a.legacy_id_sevilla || a.legacy_id
        : a.legacy_id_jerez

    if (legacyId) {
      map[legacyId] = a.id
    }
  })

  return map
}
