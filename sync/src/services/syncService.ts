import { Config, Warehouse, WAREHOUSES } from '../config.js'
import { SyncResult, SyncSummary } from '../types/index.js'
import { getLogger } from '../utils/logger.js'
import { SqlServerService } from './sqlServerService.js'
import { SupabaseService } from './supabaseService.js'
import { EmailService } from './emailService.js'
import {
  transformArticles,
  transformStock,
  mapStockToArticleIds,
} from '../transformers/articleTransformer.js'
import {
  transformCustomers,
  filterExcludedCustomers,
} from '../transformers/customerTransformer.js'
import {
  transformRentals,
  transformRentalItems,
  buildArticleMap,
} from '../transformers/rentalTransformer.js'

export interface SyncOptions {
  warehouse?: Warehouse
  only?: 'masters' | 'rentals'
  dryRun?: boolean
  verbose?: boolean
}

export class SyncService {
  private sqlServer: SqlServerService
  private supabase: SupabaseService
  private email: EmailService
  private dryRun: boolean

  constructor(config: Config, dryRun: boolean = false) {
    this.sqlServer = new SqlServerService(config.sqlServer)
    this.supabase = new SupabaseService(config.supabase.url, config.supabase.serviceRoleKey)
    this.email = new EmailService(config.email)
    this.dryRun = dryRun
  }

  async testConnections(): Promise<boolean> {
    const logger = getLogger()
    logger.info('Testing connections...')

    const sevillaOk = await this.sqlServer.testConnection('SEVILLA')
    const jerezOk = await this.sqlServer.testConnection('JEREZ')
    const supabaseOk = await this.supabase.testConnection()

    logger.info('Connection test results', {
      sevilla: sevillaOk,
      jerez: jerezOk,
      supabase: supabaseOk,
    })

    return sevillaOk && jerezOk && supabaseOk
  }

  async sync(options: SyncOptions = {}): Promise<SyncSummary> {
    const logger = getLogger()
    const summary: SyncSummary = {
      startedAt: new Date(),
      completedAt: new Date(),
      warehouse: options.warehouse,
      results: [],
      totalSuccess: true,
      criticalErrors: [],
    }

    logger.info('Starting sync', { options, dryRun: this.dryRun })

    try {
      // Determine which warehouses to sync
      const warehouses = options.warehouse ? [options.warehouse] : WAREHOUSES

      // Sync Masters (Articles + Customers)
      if (!options.only || options.only === 'masters') {
        // Articles from all warehouses
        for (const wh of warehouses) {
          const result = await this.syncArticles(wh)
          summary.results.push(result)
          if (!result.success) summary.totalSuccess = false
        }

        // Customers only from SEVILLA (master)
        if (warehouses.includes('SEVILLA') || !options.warehouse) {
          const result = await this.syncCustomers('SEVILLA')
          summary.results.push(result)
          if (!result.success) summary.totalSuccess = false
        }
      }

      // Sync Rentals
      if (!options.only || options.only === 'rentals') {
        for (const wh of warehouses) {
          const result = await this.syncRentals(wh)
          summary.results.push(result)
          if (!result.success) summary.totalSuccess = false
        }
      }

      // Update per-warehouse timestamps for successful warehouses
      if (!this.dryRun) {
        for (const wh of warehouses) {
          const warehouseResults = summary.results.filter(
            (r) => r.entity.endsWith(`-${wh}`) || (r.entity === 'customers' && wh === 'SEVILLA')
          )
          const allSucceeded = warehouseResults.length > 0 && warehouseResults.every((r) => r.success)
          if (allSucceeded) {
            await this.supabase.updateLastImportTimestamp(wh)
          }
        }
      }
    } catch (error) {
      const errorMsg = (error as Error).message
      logger.error('Critical sync error', { error: errorMsg })
      summary.criticalErrors.push(errorMsg)
      summary.totalSuccess = false
    }

    summary.completedAt = new Date()
    const duration = Math.round(
      (summary.completedAt.getTime() - summary.startedAt.getTime()) / 1000
    )

    logger.info('Sync completed', {
      duration: `${duration}s`,
      success: summary.totalSuccess,
      results: summary.results.length,
    })

    // Send email notifications
    if (!summary.totalSuccess) {
      await this.email.sendErrorAlert(summary)
    } else if (summary.results.some((r) => r.errors && r.errors.length > 0)) {
      await this.email.sendSuccessSummary(summary)
    }

    return summary
  }

  private async syncArticles(warehouse: Warehouse): Promise<SyncResult> {
    const logger = getLogger()
    const startTime = Date.now()

    try {
      logger.info(`Syncing articles`, { warehouse })

      // Get warehouse ID
      const warehouseId = await this.supabase.getWarehouseId(warehouse)
      if (!warehouseId) {
        throw new Error(`Warehouse ${warehouse} not found in Supabase`)
      }

      // Fetch from SQL Server
      const rawData = await this.sqlServer.getArticles(warehouse)

      // Transform
      const transformedArticles = transformArticles(rawData, warehouse)
      const stockRecords = transformStock(rawData, warehouse, warehouseId)

      if (this.dryRun) {
        logger.info(`[DRY-RUN] Would upsert ${transformedArticles.length} articles and ${stockRecords.length} stock records`)
        return {
          success: true,
          entity: `articles-${warehouse}`,
          count: transformedArticles.length,
          duration: Date.now() - startTime,
        }
      }

      // Upsert articles
      const upsertedArticles = await this.supabase.upsertArticles(transformedArticles)

      // Build map for stock
      const articleMap: Record<number, string> = {}
      upsertedArticles.forEach((a) => (articleMap[a.legacy_id] = a.id))

      // Map and upsert stock
      const finalStock = mapStockToArticleIds(stockRecords, articleMap)
      if (finalStock.length > 0) {
        await this.supabase.upsertStock(finalStock)
      }

      return {
        success: true,
        entity: `articles-${warehouse}`,
        count: upsertedArticles.length,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      logger.error(`Failed to sync articles`, { warehouse, error: (error as Error).message })
      return {
        success: false,
        entity: `articles-${warehouse}`,
        count: 0,
        errors: [(error as Error).message],
        duration: Date.now() - startTime,
      }
    }
  }

  private async syncCustomers(warehouse: Warehouse): Promise<SyncResult> {
    const logger = getLogger()
    const startTime = Date.now()

    try {
      logger.info(`Syncing customers`, { warehouse })

      // Fetch from SQL Server
      const rawData = await this.sqlServer.getCustomers(warehouse)

      // Filter excluded customers
      const { filtered, excludedCount } = filterExcludedCustomers(rawData)

      // Transform
      const transformedCustomers = transformCustomers(filtered)

      if (this.dryRun) {
        logger.info(`[DRY-RUN] Would upsert ${transformedCustomers.length} customers (${excludedCount} excluded)`)
        return {
          success: true,
          entity: 'customers',
          count: transformedCustomers.length,
          skipped: excludedCount,
          duration: Date.now() - startTime,
        }
      }

      // Upsert
      const upserted = await this.supabase.upsertCustomers(transformedCustomers)

      return {
        success: true,
        entity: 'customers',
        count: upserted.length,
        skipped: excludedCount,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      logger.error(`Failed to sync customers`, { warehouse, error: (error as Error).message })
      return {
        success: false,
        entity: 'customers',
        count: 0,
        errors: [(error as Error).message],
        duration: Date.now() - startTime,
      }
    }
  }

  private async syncRentals(warehouse: Warehouse): Promise<SyncResult> {
    const logger = getLogger()
    const startTime = Date.now()

    try {
      logger.info(`Syncing rentals`, { warehouse })

      // Get warehouse ID
      const warehouseId = await this.supabase.getWarehouseId(warehouse)
      if (!warehouseId) {
        throw new Error(`Warehouse ${warehouse} not found in Supabase`)
      }

      // Fetch from SQL Server
      const rawData = await this.sqlServer.getRentals(warehouse)

      // Load mappings from Supabase
      const customers = await this.supabase.getAllCustomers()
      const articles = await this.supabase.getAllArticles()

      // Build maps
      const customerMap: Record<number, string> = {}
      customers.forEach((c) => (customerMap[c.legacy_id] = c.id))

      const articleMap = buildArticleMap(articles, warehouse)

      // Transform headers
      const { rentals, skippedCustomerNotFound, skippedExcluded } = transformRentals(
        rawData,
        warehouseId,
        customerMap
      )

      logger.info(`Rental transform results`, {
        warehouse,
        total: rawData.length,
        headers: rentals.length,
        skippedCustomerNotFound,
        skippedExcluded,
      })

      if (this.dryRun) {
        logger.info(`[DRY-RUN] Would upsert ${rentals.length} rentals`)
        return {
          success: true,
          entity: `rentals-${warehouse}`,
          count: rentals.length,
          skipped: skippedCustomerNotFound + skippedExcluded,
          duration: Date.now() - startTime,
        }
      }

      // Upsert rentals
      await this.supabase.upsertRentals(rentals)

      // Load rental IDs for items
      const createdRentals = await this.supabase.getRentalsForWarehouse(warehouseId)
      const rentalIdMap: Record<number, string> = {}
      createdRentals.forEach((r) => (rentalIdMap[r.legacy_id] = r.id))

      // Transform items
      const { items: rentalItems, skipped: skippedItems } = transformRentalItems(
        rawData,
        warehouse,
        rentalIdMap,
        articleMap
      )

      logger.info(`Rental items transform results`, {
        warehouse,
        items: rentalItems.length,
        skipped: skippedItems,
      })

      // Delete old items and insert new
      const rentalIds = [...new Set(rentalItems.map((ri) => ri.rental_id))]
      await this.supabase.deleteRentalItems(rentalIds)
      await this.supabase.insertRentalItems(rentalItems)

      return {
        success: true,
        entity: `rentals-${warehouse}`,
        count: rentals.length,
        skipped: skippedCustomerNotFound + skippedExcluded,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      logger.error(`Failed to sync rentals`, { warehouse, error: (error as Error).message })
      return {
        success: false,
        entity: `rentals-${warehouse}`,
        count: 0,
        errors: [(error as Error).message],
        duration: Date.now() - startTime,
      }
    }
  }
}
