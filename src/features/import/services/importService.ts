import { createClient } from '@/lib/supabase/client'
import { transformService } from './transformService'
import { ImportResult, RentalLegacy } from '../types'
import { upsertArticlesAction, upsertCustomersAction, importRentalsAction, importArticlesAction, importCustomersAction } from '../actions/importActions'

export const importService = {
    /**
     * Import articles and their initial stock
     */
    async importArticles(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ImportResult> {
        try {
            return await importArticlesAction(warehouse)
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
            return await importCustomersAction(warehouse)
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
