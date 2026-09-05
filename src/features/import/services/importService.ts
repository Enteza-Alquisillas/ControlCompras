import { createClient } from '@/lib/supabase/client'
import { transformService } from './transformService'
import { ImportResult, RentalLegacy } from '../types'
import { upsertArticlesAction, upsertCustomersAction, importRentalsAction, importArticlesAction, importCustomersAction, resetRentalsAction } from '../actions/importActions'

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
     * @param startDate Fecha minima (YYYY-MM-DD) del evento a importar. Si se omite, usa el rango por defecto (ultimos 3 meses).
     * @param endDate Fecha maxima (YYYY-MM-DD, inclusive). Si se omite, no hay tope superior.
     */
    async importRentals(warehouse: 'SEVILLA' | 'JEREZ', startDate?: string, endDate?: string): Promise<ImportResult> {
        return await importRentalsAction(warehouse, startDate, endDate)
    },

    /**
     * Reset all rentals data
     */
    async resetRentals(): Promise<ImportResult> {
        return await resetRentalsAction()
    }
}
