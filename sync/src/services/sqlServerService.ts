import sql from 'mssql'
import { SqlServerConfig, Warehouse } from '../config.js'
import { ArticleLegacy, CustomerLegacy, RentalLegacy } from '../types/index.js'
import { getLogger } from '../utils/logger.js'
import { withRetry } from '../utils/chunker.js'

export class SqlServerService {
  private configs: Record<Warehouse, SqlServerConfig>

  constructor(configs: Record<Warehouse, SqlServerConfig>) {
    this.configs = configs
  }

  private async getConnection(warehouse: Warehouse): Promise<sql.ConnectionPool> {
    const config = this.configs[warehouse]
    if (!config || !config.server) {
      throw new Error(`SQL Server configuration incomplete for ${warehouse}`)
    }
    return sql.connect(config)
  }

  async testConnection(warehouse: Warehouse): Promise<boolean> {
    const logger = getLogger()
    try {
      const pool = await this.getConnection(warehouse)
      await pool.request().query('SELECT 1 as connected')
      await pool.close()
      logger.info(`Connection test successful`, { warehouse })
      return true
    } catch (error) {
      logger.error(`Connection test failed`, { warehouse, error: (error as Error).message })
      return false
    }
  }

  async getArticles(warehouse: Warehouse): Promise<ArticleLegacy[]> {
    const logger = getLogger()
    logger.info(`Fetching articles`, { warehouse })

    return withRetry(async () => {
      const pool = await this.getConnection(warehouse)
      try {
        const mappingField = warehouse === 'SEVILLA' ? 'ID_MATERIAL_JEREZ' : 'ID_MATERIAL_SEVILLA'
        const query = `
          SELECT
            ID_MATERIAL,
            DESCRIPCION,
            CLASIFICACION,
            EXISTENCIA,
            ${mappingField}
          FROM dbo.ARTICULO_ALQUILER
          WHERE BAJA = 0
        `
        const result = await pool.request().query(query)
        logger.info(`Articles fetched`, { warehouse, count: result.recordset.length })
        return result.recordset as ArticleLegacy[]
      } finally {
        await pool.close()
      }
    })
  }

  async getCustomers(warehouse: Warehouse): Promise<CustomerLegacy[]> {
    const logger = getLogger()
    logger.info(`Fetching customers`, { warehouse })

    return withRetry(async () => {
      const pool = await this.getConnection(warehouse)
      try {
        const query = `
          SELECT
            ID_CLIENTE,
            NOMBRE_CLIENTE,
            TEL1,
            EMAIL
          FROM dbo.CLIENTE
        `
        const result = await pool.request().query(query)
        logger.info(`Customers fetched`, { warehouse, count: result.recordset.length })
        return result.recordset as CustomerLegacy[]
      } finally {
        await pool.close()
      }
    })
  }

  async getRentals(warehouse: Warehouse): Promise<RentalLegacy[]> {
    const logger = getLogger()
    logger.info(`Fetching rentals`, { warehouse })

    return withRetry(async () => {
      const pool = await this.getConnection(warehouse)
      try {
        const query = `
          SELECT
            e.ID_EVENTO,
            e.ID_CLIENTE,
            e.FECHA_EVENTO,
            e.FECHA_ENTREGA,
            e.FECHA_RECOLECTA,
            e.STATUS,
            e.NOTAS,
            e.LUGAR_DESCRIPCION,
            ed.ID_MATERIAL,
            ed.CANTIDAD,
            ed.NOTAS_ITEM
          FROM dbo.EVENTO_ALQUILER e
          LEFT JOIN dbo.EVENTO_ALQUILER_DETALLE ed ON e.ID_EVENTO = ed.ID_EVENTO
          WHERE e.FECHA_EVENTO >= DATEADD(month, -3, GETDATE())
        `
        const result = await pool.request().query(query)
        logger.info(`Rentals fetched`, { warehouse, count: result.recordset.length })
        return result.recordset as RentalLegacy[]
      } finally {
        await pool.close()
      }
    })
  }
}
