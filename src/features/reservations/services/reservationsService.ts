import { createClient } from '@/lib/supabase/client'
import { RentalWithCustomer, RentalItemWithArticle } from '../types'

export const reservationsService = {
    /**
     * Obtiene los alquileres cuya FECHA DE EVENTO coincide con el día seleccionado
     */
    async getRentalsByDate(date: string): Promise<RentalWithCustomer[]> {
        const supabase = createClient()

        const { data, error } = await supabase
            .from('rentals')
            .select('*, customer:customers(name), items:rental_items(article_id)')
            .eq('event_date', date) // Filtrado principal por event_date
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching rentals by date:', error)
            throw new Error(error.message)
        }

        return (data as any) || []
    },

    /**
     * Obtiene los artículos detallados de un alquiler específico
     */
    async getRentalItems(rentalId: string): Promise<RentalItemWithArticle[]> {
        const supabase = createClient()

        const { data, error } = await supabase
            .from('rental_items')
            .select('*, article:articles(code, description, family)')
            .eq('rental_id', rentalId)

        if (error) {
            console.error('Error fetching rental items:', error)
            throw new Error(error.message)
        }

        return (data as any) || []
    },

    /**
     * Obtiene la información completa de cabecera de un alquiler
     */
    async getRentalDetail(rentalId: string): Promise<RentalWithCustomer | null> {
        const supabase = createClient()

        const { data, error } = await supabase
            .from('rentals')
            .select('*, customer:customers(name)')
            .eq('id', rentalId)
            .single()

        if (error) {
            console.error('Error fetching rental detail:', error)
            return null
        }

        return data as any
    },

    /**
     * Busca un alquiler por su número de contrato (legacy_id)
     */
    async searchByContract(contractNumber: number): Promise<RentalWithCustomer | null> {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('rentals')
            .select('*, customer:customers(name), items:rental_items(article_id)')
            .eq('legacy_id', contractNumber)
            .neq('status', 'cancelled')
            .single()
        if (error) return null
        return (data as any) || null
    },

    /**
     * Obtiene los legacy_id anterior y siguiente al contrato dado
     */
    async getAdjacentContracts(legacyId: number): Promise<{ prevId: number | null; nextId: number | null }> {
        const supabase = createClient()
        const [prevResult, nextResult] = await Promise.all([
            supabase
                .from('rentals')
                .select('legacy_id')
                .lt('legacy_id', legacyId)
                .neq('status', 'cancelled')
                .order('legacy_id', { ascending: false })
                .limit(1)
                .single(),
            supabase
                .from('rentals')
                .select('legacy_id')
                .gt('legacy_id', legacyId)
                .neq('status', 'cancelled')
                .order('legacy_id', { ascending: true })
                .limit(1)
                .single(),
        ])
        return {
            prevId: (prevResult.data as any)?.legacy_id ?? null,
            nextId: (nextResult.data as any)?.legacy_id ?? null,
        }
    },

    /**
     * Obtiene un resumen de indicadores para el calendario:
     * - eventCount: Basado estrictamente en event_date
     * - hasBreakage: Basado en el cálculo de compromiso (rango entrega-recogida)
     */
    async getMonthIndicators(startDate: string, endDate: string) {
        const supabase = createClient()

        // 1. Conteo de eventos por event_date
        const { data: eventCounts, error: eventError } = await supabase
            .from('rentals')
            .select('event_date')
            .gte('event_date', startDate)
            .lte('event_date', endDate)
            .neq('status', 'cancelled')

        if (eventError) throw eventError

        // 2. Sobreventas (Roturas de stock). 
        // Usamos la función optimizada original que ya considera el compromiso por rango (delivery -> pickup)
        const { data: breakages, error: breakageError } = await (supabase as any)
            .rpc('get_stock_breakages_optimized', {
                start_date: startDate,
                end_date: endDate
            })

        if (breakageError) throw breakageError

        const indicators: Record<string, { eventCount: number; hasBreakage: boolean }> = {}

            // Contar eventos por su día central (event_date)
            ; (eventCounts as any[])?.forEach((r: any) => {
                const date = r.event_date
                if (!indicators[date]) indicators[date] = { eventCount: 0, hasBreakage: false }
                indicators[date].eventCount++
            })

            // Marcar sobreventas (estas ya vienen calculadas por día según el rango de los rentals)
            ; (breakages as any[])?.forEach((b: any) => {
                const date = b.breakage_date
                if (!indicators[date]) indicators[date] = { eventCount: 0, hasBreakage: false }
                indicators[date].hasBreakage = true
            })

        return indicators
    }
}
