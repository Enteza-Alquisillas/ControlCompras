import { ArticleLegacy, CustomerLegacy, RentalLegacy } from '../types'

export const transformService = {
    /**
     * Map legacy articles to Supabase format
     */
    transformArticles(legacyData: ArticleLegacy[], warehouse: 'SEVILLA' | 'JEREZ') {
        return legacyData.map(item => {
            // Unification logic: If importing from Jerez and it has a Sevilla mapping, 
            // we use the Sevilla ID as the primary legacy_id to ensure they merge.
            const effectiveLegacyId = (warehouse === 'JEREZ' && item.ID_MATERIAL_SEVILLA)
                ? item.ID_MATERIAL_SEVILLA
                : item.ID_MATERIAL

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
