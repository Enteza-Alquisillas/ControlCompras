'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Obtiene las fechas de última importación
 * Este archivo está separado de importActions para evitar cargar mssql en producción
 * Usa createClient (no admin) porque el usuario autenticado tiene permiso de lectura via RLS
 */
export async function getLastImportDates(): Promise<{ sevilla: string | null; jerez: string | null }> {
    const supabase = await createClient()

    const { data } = await (supabase as any)
        .from('system_settings')
        .select('key, value')
        .in('key', ['last_import_sevilla', 'last_import_jerez'])

    const result = { sevilla: null as string | null, jerez: null as string | null }
    data?.forEach((row: any) => {
        if (row.key === 'last_import_sevilla') result.sevilla = row.value
        if (row.key === 'last_import_jerez') result.jerez = row.value
    })

    return result
}
