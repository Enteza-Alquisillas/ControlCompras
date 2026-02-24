import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getLogger } from '../utils/logger.js'
import { processInChunks } from '../utils/chunker.js'
import {
  TransformedArticle,
  TransformedStock,
  TransformedCustomer,
  TransformedRental,
  TransformedRentalItem,
} from '../types/index.js'

export class SupabaseService {
  private client: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  async testConnection(): Promise<boolean> {
    const logger = getLogger()
    try {
      const { error } = await this.client.from('warehouses').select('id').limit(1)
      if (error) throw error
      logger.info('Supabase connection test successful')
      return true
    } catch (error) {
      logger.error('Supabase connection test failed', { error: (error as Error).message })
      return false
    }
  }

  // ============ Warehouse ============
  async getWarehouseId(code: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('warehouses')
      .select('id')
      .eq('code', code)
      .single()

    if (error || !data) return null
    return data.id
  }

  // ============ Articles ============
  async getAllArticles(): Promise<Array<{ id: string; legacy_id: number; legacy_id_sevilla: number | null; legacy_id_jerez: number | null }>> {
    const logger = getLogger()
    let articles: Array<{ id: string; legacy_id: number; legacy_id_sevilla: number | null; legacy_id_jerez: number | null }> = []
    let hasMore = true
    let offset = 0

    while (hasMore) {
      const { data, error } = await this.client
        .from('articles')
        .select('id, legacy_id, legacy_id_sevilla, legacy_id_jerez')
        .range(offset, offset + 999)

      if (error) throw error
      if (data && data.length > 0) {
        articles = [...articles, ...data]
        offset += 1000
        if (data.length < 1000) hasMore = false
      } else {
        hasMore = false
      }
    }

    logger.debug(`Loaded ${articles.length} articles from Supabase`)
    return articles
  }

  async upsertArticles(articles: TransformedArticle[]): Promise<Array<{ id: string; legacy_id: number }>> {
    const logger = getLogger()
    const { data, error } = await this.client
      .from('articles')
      .upsert(articles, { onConflict: 'legacy_id' })
      .select('id, legacy_id')

    if (error) {
      logger.error('Failed to upsert articles', { error: error.message })
      throw error
    }

    logger.info(`Upserted ${data?.length || 0} articles`)
    return data || []
  }

  async upsertStock(stockRecords: Array<{ article_id: string; warehouse_id: string; quantity: number }>): Promise<void> {
    const logger = getLogger()
    const { error } = await this.client
      .from('article_stock')
      .upsert(stockRecords, { onConflict: 'article_id,warehouse_id' })

    if (error) {
      logger.error('Failed to upsert stock', { error: error.message })
      throw error
    }

    logger.info(`Upserted ${stockRecords.length} stock records`)
  }

  // ============ Customers ============
  async getAllCustomers(): Promise<Array<{ id: string; legacy_id: number }>> {
    const logger = getLogger()
    let customers: Array<{ id: string; legacy_id: number }> = []
    let hasMore = true
    let offset = 0

    while (hasMore) {
      const { data, error } = await this.client
        .from('customers')
        .select('id, legacy_id')
        .range(offset, offset + 999)

      if (error) throw error
      if (data && data.length > 0) {
        customers = [...customers, ...data]
        offset += 1000
        if (data.length < 1000) hasMore = false
      } else {
        hasMore = false
      }
    }

    logger.debug(`Loaded ${customers.length} customers from Supabase`)
    return customers
  }

  async upsertCustomers(customers: TransformedCustomer[]): Promise<Array<{ id: string; legacy_id: number }>> {
    const logger = getLogger()
    const { data, error } = await this.client
      .from('customers')
      .upsert(customers, { onConflict: 'legacy_id' })
      .select('id, legacy_id')

    if (error) {
      logger.error('Failed to upsert customers', { error: error.message })
      throw error
    }

    logger.info(`Upserted ${data?.length || 0} customers`)
    return data || []
  }

  // ============ Rentals ============
  async getRentalsForWarehouse(warehouseId: string): Promise<Array<{ id: string; legacy_id: number }>> {
    const logger = getLogger()
    let rentals: Array<{ id: string; legacy_id: number }> = []
    let hasMore = true
    let offset = 0

    while (hasMore) {
      const { data, error } = await this.client
        .from('rentals')
        .select('id, legacy_id')
        .eq('warehouse_id', warehouseId)
        .range(offset, offset + 999)

      if (error) throw error
      if (data && data.length > 0) {
        rentals = [...rentals, ...data]
        offset += 1000
        if (data.length < 1000) hasMore = false
      } else {
        hasMore = false
      }
    }

    logger.debug(`Loaded ${rentals.length} rentals for warehouse from Supabase`)
    return rentals
  }

  async upsertRentals(rentals: TransformedRental[], chunkSize: number = 500): Promise<void> {
    const logger = getLogger()
    await processInChunks(rentals, chunkSize, async (chunk) => {
      const { error } = await this.client
        .from('rentals')
        .upsert(chunk, { onConflict: 'legacy_id,warehouse_id' })

      if (error) {
        logger.error('Failed to upsert rentals chunk', { error: error.message })
        throw error
      }
    })

    logger.info(`Upserted ${rentals.length} rentals`)
  }

  /**
   * Deletes any rental in Supabase (along with its items) that:
   * - Belongs to this warehouse
   * - Has a legacy_id (came from the legacy system)
   * - Has an event_date within the sync window (sinceDate)
   * - Is NOT present in the activeLegacyIds list from the source system
   *
   * This handles rentals whose STATUS changed from VIGENTE (or were deleted)
   * in the source system. The SQL query already filters to STATUS='VIGENTE',
   * so anything absent from activeLegacyIds is no longer valid.
   */
  async deleteNonVigenteRentals(
    warehouseId: string,
    activeLegacyIds: number[],
    sinceDate: Date
  ): Promise<number> {
    const logger = getLogger()

    if (activeLegacyIds.length === 0) {
      logger.warn('deleteNonVigenteRentals: activeLegacyIds is empty - skipping to prevent accidental mass deletion')
      return 0
    }

    const sinceIso = sinceDate.toISOString().split('T')[0]
    const activeSet = new Set(activeLegacyIds)
    const toDelete: string[] = []
    let hasMore = true
    let offset = 0

    // Load all rentals in the sync window for this warehouse
    while (hasMore) {
      const { data, error } = await this.client
        .from('rentals')
        .select('id, legacy_id')
        .eq('warehouse_id', warehouseId)
        .not('legacy_id', 'is', null)
        .gte('event_date', sinceIso)
        .range(offset, offset + 999)

      if (error) throw error

      if (data && data.length > 0) {
        // Client-side filter: rentals whose legacy_id is no longer VIGENTE in Oracle
        for (const r of data) {
          if (r.legacy_id !== null && !activeSet.has(r.legacy_id)) {
            toDelete.push(r.id)
          }
        }
        offset += 1000
        if (data.length < 1000) hasMore = false
      } else {
        hasMore = false
      }
    }

    if (toDelete.length === 0) {
      logger.info('deleteNonVigenteRentals: no non-vigente rentals detected', { warehouseId, sinceIso })
      return 0
    }

    // Delete rental items first (foreign key constraint), then delete rentals
    await this.deleteRentalItems(toDelete)

    await processInChunks(toDelete, 200, async (chunk) => {
      const { error } = await this.client
        .from('rentals')
        .delete()
        .in('id', chunk)

      if (error) {
        logger.error('Failed to delete non-vigente rentals chunk', { error: error.message })
        throw error
      }
    })

    logger.info(`Deleted ${toDelete.length} non-vigente rentals and their items from Supabase`, {
      warehouseId,
      sinceIso,
    })
    return toDelete.length
  }

  async deleteRentalItems(rentalIds: string[]): Promise<void> {
    const logger = getLogger()
    await processInChunks(rentalIds, 200, async (chunk) => {
      await this.client.from('rental_items').delete().in('rental_id', chunk)
    })
    logger.debug(`Deleted rental items for ${rentalIds.length} rentals`)
  }

  async insertRentalItems(items: TransformedRentalItem[], chunkSize: number = 500): Promise<void> {
    const logger = getLogger()
    await processInChunks(items, chunkSize, async (chunk) => {
      const { error } = await this.client.from('rental_items').insert(chunk)
      if (error) {
        logger.error('Failed to insert rental items chunk', { error: error.message })
        throw error
      }
    })

    logger.info(`Inserted ${items.length} rental items`)
  }

  // ============ System Settings ============
  async updateLastImportTimestamp(warehouse: string): Promise<void> {
    const logger = getLogger()
    const key = `last_import_${warehouse.toLowerCase()}`
    const now = new Date().toISOString()

    const { error } = await this.client.from('system_settings').upsert(
      { key, value: now, updated_at: now },
      { onConflict: 'key' }
    )

    if (error) {
      logger.error(`Failed to update ${key}`, { error: error.message, code: error.code })
    } else {
      logger.info(`Updated ${key} timestamp`, { value: now })
    }
  }
}
