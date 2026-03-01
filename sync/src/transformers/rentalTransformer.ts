import { Warehouse } from '../config.js'
import { RentalLegacy, TransformedRental, TransformedRentalItem } from '../types/index.js'
import { isExcludedCustomer } from './customerTransformer.js'

export interface RentalTransformResult {
  rentals: TransformedRental[]
  skippedCustomerNotFound: number
  skippedExcluded: number
}

/**
 * Transform legacy rentals to Supabase format
 * Groups by ID_EVENTO to get unique headers
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

    uniqueHeadersMap.set(item.ID_EVENTO, {
      legacy_id: item.ID_EVENTO,
      customer_id: customerId,
      warehouse_id: warehouseId,
      delivery_address: item.LUGAR_DESCRIPCION,
      event_date: item.FECHA_EVENTO,
      delivery_date: item.FECHA_ENTREGA,
      pickup_date: item.FECHA_RECOLECTA,
      status: item.STATUS || 'confirmed',
      notes: item.NOTAS,
    })
  })

  return {
    rentals: Array.from(uniqueHeadersMap.values()),
    skippedCustomerNotFound,
    skippedExcluded,
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
