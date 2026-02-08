import { Warehouse } from '../config.js'
import { ArticleLegacy, TransformedArticle, TransformedStock } from '../types/index.js'

/**
 * Transform legacy articles to Supabase format
 * Handles unification logic between Sevilla and Jerez
 */
export function transformArticles(
  legacyData: ArticleLegacy[],
  warehouse: Warehouse
): TransformedArticle[] {
  return legacyData.map((item) => {
    // Unification logic: If importing from Jerez and it has a Sevilla mapping,
    // use the Sevilla ID as the primary legacy_id to ensure they merge.
    const effectiveLegacyId =
      warehouse === 'JEREZ' && item.ID_MATERIAL_SEVILLA
        ? item.ID_MATERIAL_SEVILLA
        : item.ID_MATERIAL

    return {
      legacy_id: effectiveLegacyId,
      code: `ART-${effectiveLegacyId}`,
      description: item.DESCRIPCION,
      family: item.CLASIFICACION,
      is_active: true,
      legacy_id_sevilla:
        item.ID_MATERIAL_SEVILLA || (warehouse === 'SEVILLA' ? item.ID_MATERIAL : null),
      legacy_id_jerez:
        item.ID_MATERIAL_JEREZ || (warehouse === 'JEREZ' ? item.ID_MATERIAL : null),
    }
  })
}

/**
 * Transform legacy articles to stock records
 */
export function transformStock(
  legacyData: ArticleLegacy[],
  warehouse: Warehouse,
  warehouseId: string
): TransformedStock[] {
  return legacyData
    .filter((item) => item.EXISTENCIA > 0)
    .map((item) => {
      const effectiveLegacyId =
        warehouse === 'JEREZ' && item.ID_MATERIAL_SEVILLA
          ? item.ID_MATERIAL_SEVILLA
          : item.ID_MATERIAL

      return {
        legacy_id: effectiveLegacyId,
        warehouse_id: warehouseId,
        quantity: item.EXISTENCIA,
      }
    })
}

/**
 * Map legacy_id to Supabase article_id for stock records
 */
export function mapStockToArticleIds(
  stockRecords: TransformedStock[],
  articleMap: Record<number, string>
): Array<{ article_id: string; warehouse_id: string; quantity: number }> {
  return stockRecords
    .map((s) => ({
      article_id: articleMap[s.legacy_id],
      warehouse_id: s.warehouse_id,
      quantity: s.quantity,
    }))
    .filter((s) => s.article_id)
}
