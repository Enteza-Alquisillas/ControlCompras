'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { ImportResult } from '../types'
import { legacyService } from '../services/legacyService'
import { transformService } from '../services/transformService'

// Clientes internos a excluir (Sevilla-Jerez, Jerez-Sevilla, etc.)
const EXCLUDED_CUSTOMERS = [410000, 110000]

/**
 * Converts a SQL Server date value (Date object or string) to 'YYYY-MM-DD'.
 * Uses local date parts to avoid UTC timezone shift for dates stored as midnight.
 * Returns null if the value is null/undefined/invalid.
 */
function toDateString(value: unknown): string | null {
    if (value == null) return null
    const d = value instanceof Date ? value : new Date(value as string)
    if (isNaN(d.getTime())) return null
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * Clamps a date string to be within [min, max].
 */
function clampDate(value: string, min: string, max: string): string {
    if (value < min) return min
    if (value > max) return max
    return value
}

/**
 * Guarda la fecha de última importación en system_settings
 */
async function saveLastImportDate(warehouse: string) {
    const supabase = await createAdminClient()
    const key = `last_import_${warehouse.toLowerCase()}`
    const now = new Date().toISOString()

    await (supabase as any)
        .from('system_settings')
        .upsert({ key, value: now, updated_at: now }, { onConflict: 'key' })
}

/**
 * Helper to process array in chunks
 */
async function processInChunks<T>(items: T[], chunkSize: number, fn: (chunk: T[]) => Promise<void>) {
    for (let i = 0; i < items.length; i += chunkSize) {
        await fn(items.slice(i, i + chunkSize))
    }
}

export async function importArticlesAction(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ImportResult> {
    const supabase = await createAdminClient()
    try {
        console.log(`[Action] Importando artículos para ${warehouse}...`)
        const rawData = await legacyService.getLegacyData('articles', warehouse)
        const transformedArticles = transformService.transformArticles(rawData, warehouse)

        const { data: warehouseData, error } = await (supabase as any)
            .from('warehouses')
            .select('id, code')
            .eq('code', warehouse)
            .single()

        if (error) {
            console.error(`[Action] Error buscando warehouse ${warehouse}:`, error)
            throw new Error(`Error BD (${error.code || 'Desconocido'}): ${error.message} - Posible fallo de permisos o conexión.`)
        }

        if (!warehouseData) throw new Error(`Warehouse ${warehouse} no encontrado en base de datos.`)

        const stockRecords = rawData.map((item: any) => {
            const effectiveLegacyId = (warehouse === 'JEREZ' && item.ID_MATERIAL_SEVILLA)
                ? item.ID_MATERIAL_SEVILLA
                : item.ID_MATERIAL

            return {
                legacy_id: effectiveLegacyId,
                warehouse_id: warehouseData.id,
                quantity: item.EXISTENCIA,
            }
        }).filter((s: any) => s.quantity > 0)

        // Obtener artículos existentes para mapeo de stock
        let existingArticles: any[] = []
        let hasMore = true
        let offset = 0
        while (hasMore) {
            const { data, error } = await (supabase as any)
                .from('articles')
                .select('id, legacy_id')
                .range(offset, offset + 999)
            if (error) throw error
            if (data && data.length > 0) {
                existingArticles = [...existingArticles, ...data]
                offset += 1000
                if (data.length < 1000) hasMore = false
            } else {
                hasMore = false
            }
        }

        const articleMap: Record<number, string> = {}
        existingArticles.forEach(a => articleMap[a.legacy_id] = a.id)

        // Combinar con los recién transformados (por si hay nuevos)
        transformedArticles.forEach((a: any) => {
            // Nota: El ID real de Supabase no se sabe hasta el upsert para los NUEVOS,
            // pero el upsert de articles ya maneja el onConflict.
        })

        const upsertResult = await upsertArticlesAction(transformedArticles, stockRecords)
        if (upsertResult.success) {
            await saveLastImportDate(warehouse)
        }
        return upsertResult
    } catch (error: any) {
        console.error('[Action] Error en Importación de Artículos:', error)
        return { success: false, count: 0, table: 'articles', error: error.message }
    }
}


export async function importRentalsAction(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ImportResult> {
    const supabase = await createAdminClient()

    try {
        console.log(`[Action] Iniciando importación directa para ${warehouse}...`)

        // 1. Obtener datos de SQL Server (Directo, sin fetch interno)
        const rawData = await legacyService.getLegacyData('rentals', warehouse)
        console.log(`[Action] Datos recibidos de SQL: ${rawData.length} líneas.`)

        // 2. Cargar mapeos de Supabase
        console.log('[Action] Cargando clientes de Supabase...')
        let customers: any[] = []
        let hasMoreCustomers = true
        let customerOffset = 0
        while (hasMoreCustomers) {
            const { data, error } = await (supabase as any)
                .from('customers')
                .select('id, legacy_id')
                .range(customerOffset, customerOffset + 999)

            if (error) throw error
            if (data && data.length > 0) {
                customers = [...customers, ...data]
                customerOffset += 1000
                if (data.length < 1000) hasMoreCustomers = false
            } else {
                hasMoreCustomers = false
            }
        }
        console.log(`[Action] Total clientes cargados de Supabase: ${customers.length}`)

        console.log('[Action] Cargando artículos de Supabase...')
        let articles: any[] = []
        let hasMoreArticles = true
        let articleOffset = 0
        while (hasMoreArticles) {
            const { data, error } = await (supabase as any)
                .from('articles')
                .select('id, legacy_id, legacy_id_sevilla, legacy_id_jerez')
                .range(articleOffset, articleOffset + 999)

            if (error) throw error
            if (data && data.length > 0) {
                articles = [...articles, ...data]
                articleOffset += 1000
                if (data.length < 1000) hasMoreArticles = false
            } else {
                hasMoreArticles = false
            }
        }
        console.log(`[Action] Total artículos cargados de Supabase: ${articles.length}`)

        const { data: warehouseData } = await (supabase as any).from('warehouses').select('id').eq('code', warehouse).single()
        if (!warehouseData) throw new Error(`Warehouse ${warehouse} no encontrado`)

        const customerMap: Record<number, string> = {}
        customers.forEach((c: any) => customerMap[c.legacy_id] = c.id)

        const articleMap: Record<number, string> = {}
        articles.forEach((a: any) => {
            const id = (warehouse === 'SEVILLA') ? (a.legacy_id_sevilla || a.legacy_id) : a.legacy_id_jerez
            if (id) articleMap[id] = a.id
        })

        // 3. Transformar Cabeceras
        console.log('[Action] Transformando cabeceras...')
        const uniqueHeadersMap = new Map<number, any>()
        let skippedCustomerCount = 0
        let excludedCustomerCount = 0
        let skippedInvalidDates = 0
        const dateWarnings: string[] = []

        rawData.forEach((item: any) => {
            if (!uniqueHeadersMap.has(item.ID_EVENTO)) {
                if (EXCLUDED_CUSTOMERS.includes(item.ID_CLIENTE)) {
                    excludedCustomerCount++
                    return
                }
                const customerId = customerMap[item.ID_CLIENTE]
                if (!customerId) {
                    skippedCustomerCount++
                    return
                }

                const deliveryDate = toDateString(item.FECHA_ENTREGA)
                const pickupDate = toDateString(item.FECHA_RECOLECTA)
                const rawEventDate = toDateString(item.FECHA_EVENTO)

                // Skip rentals with missing required dates
                if (!deliveryDate || !pickupDate) {
                    skippedInvalidDates++
                    dateWarnings.push(`ID_EVENTO ${item.ID_EVENTO}: fechas nulas (ENTREGA=${item.FECHA_ENTREGA}, RECOLECTA=${item.FECHA_RECOLECTA})`)
                    return
                }

                // Skip rentals where delivery is after pickup
                if (deliveryDate > pickupDate) {
                    skippedInvalidDates++
                    dateWarnings.push(`ID_EVENTO ${item.ID_EVENTO}: entrega (${deliveryDate}) > recogida (${pickupDate})`)
                    return
                }

                // Clamp event_date to [delivery_date, pickup_date] — some legacy records
                // have FECHA_EVENTO outside the rental window, violating the valid_dates constraint
                const baseEventDate = rawEventDate ?? deliveryDate
                const eventDate = clampDate(baseEventDate, deliveryDate, pickupDate)
                if (eventDate !== baseEventDate) {
                    dateWarnings.push(`ID_EVENTO ${item.ID_EVENTO}: event_date ajustado de ${baseEventDate} a ${eventDate}`)
                }

                uniqueHeadersMap.set(item.ID_EVENTO, {
                    legacy_id: item.ID_EVENTO,
                    customer_id: customerId,
                    warehouse_id: warehouseData.id,
                    delivery_address: item.LUGAR_DESCRIPCION,
                    event_date: eventDate,
                    delivery_date: deliveryDate,
                    pickup_date: pickupDate,
                    status: item.STATUS || 'confirmed',
                    notes: item.NOTAS
                })
            }
        })

        const rentals = Array.from(uniqueHeadersMap.values())
        console.log(`[Action] Resultados de cabeceras:
            - Totales en SQL: ${rawData.length}
            - Únicos (Cabeceras): ${uniqueHeadersMap.size}
            - Saltados (Cliente no encontrado): ${skippedCustomerCount}
            - Excluidos (Internal/Test): ${excludedCustomerCount}
            - Saltados (Fechas inválidas): ${skippedInvalidDates}
            - Listos para Upsert: ${rentals.length}`)

        if (dateWarnings.length > 0) {
            console.warn(`[Action] Avisos de fechas (${dateWarnings.length}):`, dateWarnings)
        }

        // 4. Upsert Alquileres en bloques — con fallback uno a uno para aislar registros malos
        let upsertedCount = 0
        let skippedConstraintCount = 0
        await processInChunks(rentals, 500, async (chunk) => {
            const { error } = await (supabase as any).from('rentals').upsert(chunk, { onConflict: 'legacy_id,warehouse_id' })
            if (!error) {
                upsertedCount += chunk.length
                return
            }
            // Chunk failed — retry one by one to isolate the bad record
            console.warn(`[Action] Chunk de ${chunk.length} rentals falló, reintentando uno a uno...`, error.message)
            for (const rental of chunk) {
                const { error: singleError } = await (supabase as any).from('rentals').upsert(rental, { onConflict: 'legacy_id,warehouse_id' })
                if (singleError) {
                    skippedConstraintCount++
                    console.error(`[Action] Saltando rental con datos inválidos:`, {
                        legacy_id: rental.legacy_id,
                        event_date: rental.event_date,
                        delivery_date: rental.delivery_date,
                        pickup_date: rental.pickup_date,
                        error: singleError.message,
                    })
                } else {
                    upsertedCount++
                }
            }
        })
        console.log(`[Action] Upsert completado: ${upsertedCount} guardados, ${skippedConstraintCount} saltados por constraint`)

        // 5. Cargar IDs de alquileres para el detalle (Paginado tmb por si acaso)
        console.log('[Action] Cargando IDs de alquileres creados/actualizados...')
        let createdRentals: any[] = []
        let hasMoreCreated = true
        let createdOffset = 0
        while (hasMoreCreated) {
            const { data, error } = await (supabase as any)
                .from('rentals')
                .select('id, legacy_id')
                .eq('warehouse_id', warehouseData.id)
                .range(createdOffset, createdOffset + 999)

            if (error) throw error
            if (data && data.length > 0) {
                createdRentals = [...createdRentals, ...data]
                createdOffset += 1000
                if (data.length < 1000) hasMoreCreated = false
            } else {
                hasMoreCreated = false
            }
        }
        console.log(`[Action] Mapeo de alquileres cargado: ${createdRentals.length}`)

        const rentalIdMap: Record<number, string> = {}
        createdRentals.forEach((r: any) => rentalIdMap[r.legacy_id] = r.id)

        // 6. Transformar e Insertar Detalles
        console.log('[Action] Transformando líneas de detalle...')
        let skippedItemsCount = 0
        const rentalItems = rawData.map((item: any) => {
            const rentalId = rentalIdMap[item.ID_EVENTO]
            const articleId = articleMap[item.ID_MATERIAL]
            if (!rentalId || !articleId) {
                skippedItemsCount++
                return null
            }
            return {
                rental_id: rentalId,
                article_id: articleId,
                quantity: item.CANTIDAD,
                notes: item.NOTAS_ITEM
            }
        }).filter((ri: any) => ri !== null)

        console.log(`[Action] Resultados de detalles:
            - Líneas totales SQL: ${rawData.length}
            - Líneas válidas mapeadas: ${rentalItems.length}
            - Líneas saltadas (Art/Alq no encontrado): ${skippedItemsCount}`)

        // Borrar antiguos e insertar nuevos
        const rentalIds = Array.from(new Set(rentalItems.map((ri: any) => ri.rental_id)))
        console.log(`[Action] Limpiando detalles antiguos para ${rentalIds.length} alquileres...`)
        await processInChunks(rentalIds, 200, async (chunk) => {
            await (supabase as any).from('rental_items').delete().in('rental_id', chunk)
        })

        console.log(`[Action] Insertando ${rentalItems.length} líneas de detalle en bloques de 500...`)
        await processInChunks(rentalItems, 500, async (chunk) => {
            const { error } = await (supabase as any).from('rental_items').insert(chunk)
            if (error) throw error
        })

        console.log(`[Action] ¡Importación de ${warehouse} completada con éxito!`)
        await saveLastImportDate(warehouse)
        return { success: true, count: upsertedCount, table: 'rentals', skippedCount: skippedCustomerCount + skippedInvalidDates + skippedConstraintCount, totalFound: rawData.length }

    } catch (error: any) {
        console.error('[Action] Error en Importación Directa:', error)
        return { success: false, count: 0, table: 'rentals', error: error.message }
    }
}

export async function importCustomersAction(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ImportResult> {
    try {
        console.log(`[Action] Importando clientes para ${warehouse}...`)
        const rawData = await legacyService.getLegacyData('customers', warehouse)

        // Filtrar clientes excluidos
        const filteredData = rawData.filter((c: any) => !EXCLUDED_CUSTOMERS.includes(c.ID_CLIENTE))

        const transformedCustomers = transformService.transformCustomers(filteredData)
        const result = await upsertCustomersAction(transformedCustomers)
        if (result.success) {
            await saveLastImportDate(warehouse)
        }
        return result
    } catch (error: any) {
        console.error('[Action] Error en Importación de Clientes:', error)
        return { success: false, count: 0, table: 'customers', error: error.message }
    }
}

export async function testConnectionAction(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ImportResult> {
    try {
        console.log(`[Action] Probando conexión para ${warehouse}...`)
        await legacyService.getLegacyData('test', warehouse)
        return { success: true, count: 0, table: 'test' }
    } catch (error: any) {
        console.error('[Action] Error en Test de Conexión:', error)
        return { success: false, count: 0, table: 'test', error: error.message }
    }
}

export async function upsertArticlesAction(articles: any[], stockRecords: any[]): Promise<ImportResult> {
    const supabase = await createAdminClient()
    try {
        const { data: upsertedArticles, error: articlesError } = await (supabase as any)
            .from('articles')
            .upsert(articles, { onConflict: 'legacy_id' })
            .select()

        if (articlesError) throw articlesError

        if (stockRecords.length > 0) {
            const articleMap: Record<number, string> = {}
                ; (upsertedArticles as any[])?.forEach(a => {
                    articleMap[a.legacy_id] = a.id
                })

            const finalizedStock = stockRecords.map(s => ({
                article_id: articleMap[s.legacy_id],
                warehouse_id: s.warehouse_id,
                quantity: s.quantity
            })).filter(s => s.article_id)

            if (finalizedStock.length > 0) {
                const { error: stockError } = await (supabase as any)
                    .from('article_stock')
                    .upsert(finalizedStock, { onConflict: 'article_id,warehouse_id' })

                if (stockError) throw stockError
            }
        }
        return { success: true, count: (upsertedArticles as any[])?.length || 0, table: 'articles' }
    } catch (error: any) {
        return { success: false, count: 0, table: 'articles', error: error.message }
    }
}

export async function upsertCustomersAction(customers: any[]): Promise<ImportResult> {
    const supabase = await createAdminClient()
    try {
        const { data: upserted, error: dbError } = await (supabase as any)
            .from('customers')
            .upsert(customers, { onConflict: 'legacy_id' })
            .select()
        if (dbError) throw dbError
        return { success: true, count: (upserted as any[])?.length || 0, table: 'customers' }
    } catch (error: any) {
        return { success: false, count: 0, table: 'customers', error: error.message }
    }
}

/**
 * Borra todas las reservas y sus detalles para permitir una importación limpia
 */
export async function resetRentalsAction(): Promise<ImportResult> {
    const supabase = await createAdminClient()
    try {
        console.log('[Action] Iniciando limpieza total de reservas...')

        // 1. Borrar todas las líneas de detalle
        const { error: itemsError } = await (supabase as any)
            .from('rental_items')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000') // Borrado masivo (requiere condición en algunos entornos)

        if (itemsError) throw itemsError

        // 2. Borrar todas las cabeceras de reservas
        const { error: rentalsError } = await (supabase as any)
            .from('rentals')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')

        if (rentalsError) throw rentalsError

        console.log('[Action] Limpieza de reservas completada con éxito.')
        return { success: true, count: 0, table: 'rentals' }
    } catch (error: any) {
        console.error('[Action] Error en Reset de Reservas:', error)
        return { success: false, count: 0, table: 'rentals', error: error.message }
    }
}

