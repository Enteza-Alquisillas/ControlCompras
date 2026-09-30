import { Warehouse } from '../config.js'
import { ArticleLegacy, TransformedArticle, TransformedStock } from '../types/index.js'

/**
 * Unification logic: If importing from Jerez and it has a Sevilla mapping,
 * use the Sevilla ID as the primary legacy_id to ensure they merge.
 */
function getEffectiveLegacyId(item: ArticleLegacy, warehouse: Warehouse): number {
  return warehouse === 'JEREZ' && item.ID_MATERIAL_SEVILLA
    ? item.ID_MATERIAL_SEVILLA
    : item.ID_MATERIAL
}

export interface MappingConflict {
  legacyId: number
  kept: ArticleLegacy
  dropped: ArticleLegacy[]
}

/**
 * Keep one row per effective legacy_id.
 * If two Jerez articles share the same ID_MATERIAL_SEVILLA, a single upsert containing
 * both is rejected by Postgres ("ON CONFLICT DO UPDATE command cannot affect row a second
 * time") and the whole warehouse stops syncing. The row whose own ID matches the mapping
 * is kept (it is the consistent one); the others are reported so the mapping can be fixed
 * in SQL Server. Incident 2026-08-03: Jerez 4388 pointed to Sevilla 4366.
 */
export function dedupeByEffectiveId(
  legacyData: ArticleLegacy[],
  warehouse: Warehouse
): { rows: ArticleLegacy[]; conflicts: MappingConflict[] } {
  const groups = new Map<number, ArticleLegacy[]>()
  for (const item of legacyData) {
    const id = getEffectiveLegacyId(item, warehouse)
    groups.set(id, [...(groups.get(id) ?? []), item])
  }

  const conflicts: MappingConflict[] = []
  const droppedRows = new Set<ArticleLegacy>()
  for (const [legacyId, items] of groups) {
    if (items.length < 2) continue
    const kept = items.find((i) => i.ID_MATERIAL === legacyId) ?? items[0]
    const dropped = items.filter((i) => i !== kept)
    dropped.forEach((i) => droppedRows.add(i))
    conflicts.push({ legacyId, kept, dropped })
  }

  return { rows: legacyData.filter((i) => !droppedRows.has(i)), conflicts }
}

export function describeMappingConflict(conflict: MappingConflict, warehouse: Warehouse): string {
  const dropped = conflict.dropped.map((i) => `${i.ID_MATERIAL} "${i.DESCRIPCION}"`).join(', ')
  return (
    `${warehouse}: skipped article ${dropped} because it maps to legacy_id ${conflict.legacyId}, ` +
    `already used by ${conflict.kept.ID_MATERIAL} "${conflict.kept.DESCRIPCION}". Fix ID_MATERIAL_SEVILLA in SQL Server.`
  )
}

/**
 * Transform legacy articles to Supabase format
 * Handles unification logic between Sevilla and Jerez
 */
export function transformArticles(
  legacyData: ArticleLegacy[],
  warehouse: Warehouse
): TransformedArticle[] {
  return legacyData.map((item) => {
    const effectiveLegacyId = getEffectiveLegacyId(item, warehouse)

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
      const effectiveLegacyId = getEffectiveLegacyId(item, warehouse)

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
