import { createClient } from '@/lib/supabase/client'
import { transformService } from './transformService'
import { ImportResult, RentalLegacy } from '../types'
import { upsertArticlesAction, upsertCustomersAction, importRentalsAction } from '../actions/importActions'

export const importService = {
    /**
     * Import articles and their initial stock
     */
    async importArticles(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ImportResult> {
        const supabase = createClient()

        try {
            const response = await fetch('/api/import/legacy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'articles', warehouse }),
            })

            const { data, success, error } = await response.json()
            if (!success) throw new Error(error)

            const articles = transformService.transformArticles(data, warehouse)

            const { data: warehouseData } = await (supabase as any)
                .from('warehouses')
                .select('id, code')
                .eq('code', warehouse)
                .single()

            if (!warehouseData) throw new Error(`Warehouse ${warehouse} not found`)

            // Prepare stock records with legacy_id for server-side mapping if needed
            // Actually, we need the UUIDs on server, let's pass legacy_ids and let the action handle some mapping
            // But we already have the articles list. Let's let the action handle the bulk of it.

            const stockRecords = (data as any[]).map(item => {
                const effectiveLegacyId = (warehouse === 'JEREZ' && item.ID_MATERIAL_SEVILLA)
                    ? item.ID_MATERIAL_SEVILLA
                    : item.ID_MATERIAL

                return {
                    legacy_id: effectiveLegacyId, // Map by legacy_id on server
                    warehouse_id: warehouseData.id,
                    quantity: item.EXISTENCIA,
                }
            }).filter(s => s.quantity > 0)

            return await upsertArticlesAction(articles, stockRecords)

        } catch (error: any) {
            console.error('Import Articles Error:', error)
            return {
                success: false, count: 0, table: 'articles',
                error: error.message
            }
        }
    },

    /**
     * Import customers
     */
    async importCustomers(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ImportResult> {
        try {
            const response = await fetch('/api/import/legacy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'customers', warehouse }),
            })

            const { data, success, error } = await response.json()
            if (!success) throw new Error(error)

            const customers = transformService.transformCustomers(data)
            return await upsertCustomersAction(customers)
        } catch (error: any) {
            return { success: false, count: 0, table: 'customers', error: error.message }
        }
    },

    /**
     * Import rentals (Master-Detail)
     */
    async importRentals(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ImportResult> {
        return await importRentalsAction(warehouse)
    }
}
