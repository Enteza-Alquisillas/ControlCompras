import { ArticleLegacy, CustomerLegacy, RentalLegacy } from '../types'

function normalizeVat(value: string | null): string | null {
    if (!value) return null
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return normalized.startsWith('ES') ? normalized.slice(2) || null : normalized || null
}

/**
 * Unification logic: If importing from Jerez and it has a Sevilla mapping,
 * we use the Sevilla ID as the primary legacy_id to ensure they merge.
 */
function getEffectiveLegacyId(item: ArticleLegacy, warehouse: 'SEVILLA' | 'JEREZ'): number {
    return (warehouse === 'JEREZ' && item.ID_MATERIAL_SEVILLA)
        ? item.ID_MATERIAL_SEVILLA
        : item.ID_MATERIAL
}

export const transformService = {
    getEffectiveLegacyId,

    /**
     * Keep one row per effective legacy_id. Two Jerez articles sharing the same
     * ID_MATERIAL_SEVILLA make Postgres reject the whole upsert ("ON CONFLICT DO UPDATE
     * command cannot affect row a second time"). The row whose own ID matches the mapping
     * is kept; the others are returned as warnings so the mapping gets fixed in SQL Server.
     * Mirrors dedupeByEffectiveId in sync/src/transformers/articleTransformer.ts.
     */
    dedupeByEffectiveId(legacyData: ArticleLegacy[], warehouse: 'SEVILLA' | 'JEREZ') {
        const groups = new Map<number, ArticleLegacy[]>()
        for (const item of legacyData) {
            const id = getEffectiveLegacyId(item, warehouse)
            groups.set(id, [...(groups.get(id) ?? []), item])
        }

        const warnings: string[] = []
        const droppedRows = new Set<ArticleLegacy>()
        for (const [legacyId, items] of groups) {
            if (items.length < 2) continue
            const kept = items.find(i => i.ID_MATERIAL === legacyId) ?? items[0]
            const dropped = items.filter(i => i !== kept)
            dropped.forEach(i => droppedRows.add(i))
            warnings.push(
                `${warehouse}: artículo ${dropped.map(i => `${i.ID_MATERIAL} "${i.DESCRIPCION}"`).join(', ')} omitido: ` +
                `su ID_MATERIAL_SEVILLA (${legacyId}) ya lo usa ${kept.ID_MATERIAL} "${kept.DESCRIPCION}". Hay que corregirlo en el programa de gestión.`
            )
        }

        return { rows: legacyData.filter(i => !droppedRows.has(i)), warnings }
    },

    /**
     * Map legacy articles to Supabase format
     */
    transformArticles(legacyData: ArticleLegacy[], warehouse: 'SEVILLA' | 'JEREZ') {
        return legacyData.map(item => {
            const effectiveLegacyId = getEffectiveLegacyId(item, warehouse)

            return {
                legacy_id: effectiveLegacyId,
                code: `ART-${effectiveLegacyId}`,
                description: item.DESCRIPCION,
                family: item.CLASIFICACION,
                is_active: true,
                legacy_id_sevilla: item.ID_MATERIAL_SEVILLA || (warehouse === 'SEVILLA' ? item.ID_MATERIAL : null),
                legacy_id_jerez: item.ID_MATERIAL_JEREZ || (warehouse === 'JEREZ' ? item.ID_MATERIAL : null)
            }
        })
    },

    /**
     * Map legacy stock to Supabase format
     */
    transformStock(legacyData: ArticleLegacy[], warehouseIds: Record<string, string>) {
        const stockRecords = []

        // Find the warehouse ID for the current context (Sevilla or Jerez)
        // Note: each warehouse call imports its own stock
        const warehouseId = Object.values(warehouseIds)[0]

        for (const item of legacyData) {
            if (item.EXISTENCIA > 0) {
                stockRecords.push({
                    article_legacy_id: item.ID_MATERIAL,
                    warehouse_id: warehouseId,
                    quantity: item.EXISTENCIA,
                })
            }
        }

        return stockRecords
    },

    /**
     * Map legacy customers to Supabase format
     */
    transformCustomers(legacyData: CustomerLegacy[]) {
        return legacyData.map(item => ({
            legacy_id: item.ID_CLIENTE,
            name: item.NOMBRE_CLIENTE,
            phone: item.TEL1,
            email: item.EMAIL,
            vat: normalizeVat(item.RFC),
        }))
    },

    /**
     * Map legacy rentals to Supabase format
     */
    transformRentals(legacyData: RentalLegacy[]) {
        return legacyData.map(item => ({
            legacy_id: item.ID_EVENTO,
            customer_legacy_id: item.ID_CLIENTE,
            event_date: item.FECHA_EVENTO,
            delivery_date: item.FECHA_ENTREGA,
            pickup_date: item.FECHA_RECOLECTA,
            status: item.STATUS || 'confirmed',
            notes: item.NOTAS
        }))
    }
}
