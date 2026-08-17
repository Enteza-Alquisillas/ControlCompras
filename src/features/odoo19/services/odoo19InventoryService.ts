import { legacyService } from '@/features/import/services/legacyService'
import type { ArticleLegacy } from '@/features/import/types'
import type { Odoo19Client } from './odoo19Client'
import { resolveOdoo19Destination, companyContext } from './odoo19WarehouseResolver'
import type {
  Odoo19InventoryAdjustmentResult,
  Odoo19InventoryApplyResult,
  Odoo19InventoryItem,
  Odoo19InventoryPreview,
  Odoo19InventoryStatus,
  Odoo19Product,
} from '../types'

/**
 * "SOBRE VENTA..." (4502-4507): EXISTENCIA=9999 en el legacy es un valor centinela
 * de stock no controlado, no una cantidad física real. Exclusión permanente.
 */
const EXCLUDED_INVENTORY_CODES = ['4502', '4503', '4504', '4505', '4506', '4507']

/**
 * 3666 y 4514 están archivados en Odoo por motivos distintos y no resolubles
 * automáticamente (ver PRP-ODOO-004, sección Aprendizajes): 4514 es un archivado
 * simple, pero 3666 tiene el default_code ocupado por un producto duplicado
 * activo distinto ("CAMARA FRIGORIFICA... (copia)"), por lo que una búsqueda
 * genérica por código enlazaría el stock al producto equivocado. Ambos quedan
 * fuera de la reconciliación automática hasta resolverse a mano en Odoo.
 */
const MANUAL_REVIEW_CODES = ['3666', '4514']

interface LegacyArticleAggregate {
  description: string
  family: string | null
  sevillaQty: number | null
  jerezQty: number | null
}

function normalizedCode(legacyId: number): string {
  return String(legacyId)
}

/**
 * Aplica la misma unificación de IDs Sevilla/Jerez que articleTransformer.ts:
 * un artículo de Jerez con mapeo a Sevilla se agrega bajo el ID de Sevilla.
 */
function aggregateLegacyArticles(
  sevillaRows: ArticleLegacy[],
  jerezRows: ArticleLegacy[]
): Map<string, LegacyArticleAggregate> {
  const byCode = new Map<string, LegacyArticleAggregate>()

  for (const item of sevillaRows) {
    if (item.EXISTENCIA <= 0) continue
    const code = normalizedCode(item.ID_MATERIAL)
    const existing = byCode.get(code)
    byCode.set(code, {
      description: item.DESCRIPCION,
      family: item.CLASIFICACION,
      sevillaQty: item.EXISTENCIA,
      jerezQty: existing?.jerezQty ?? null,
    })
  }

  for (const item of jerezRows) {
    if (item.EXISTENCIA <= 0) continue
    const effectiveId = item.ID_MATERIAL_SEVILLA || item.ID_MATERIAL
    const code = normalizedCode(effectiveId)
    const existing = byCode.get(code)
    byCode.set(code, {
      description: existing?.description ?? item.DESCRIPCION,
      family: existing?.family ?? item.CLASIFICACION,
      sevillaQty: existing?.sevillaQty ?? null,
      jerezQty: item.EXISTENCIA,
    })
  }

  return byCode
}

const LEGACY_CONNECTION_RETRY_DELAYS_MS = [2000, 5000, 10000]

/**
 * La conexión SQL Server sobre VPN/intranet es intermitente incluso cuando el
 * servidor está sano (visto en real: timeouts de 15s aislados que desaparecen
 * al reintentar segundos después). Sin esto, un hipo de red de 15s tira abajo
 * una carga completa de varios minutos que ya iba bien.
 */
async function getLegacyArticlesWithRetry(warehouse: 'SEVILLA' | 'JEREZ'): Promise<ArticleLegacy[]> {
  let lastError: unknown
  for (let attempt = 0; attempt <= LEGACY_CONNECTION_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, LEGACY_CONNECTION_RETRY_DELAYS_MS[attempt - 1]))
    }
    try {
      return (await legacyService.getLegacyData('articles', warehouse)) as ArticleLegacy[]
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? new Error(`No se pudo conectar a SQL Server ${warehouse} tras varios intentos: ${lastError.message}`)
    : lastError
}

/**
 * Obtiene, en vivo, los artículos activos (BAJA=0) con existencia > 0 de ambos
 * almacenes legacy. Nunca lee de Supabase: el espejo puede estar desactualizado.
 */
export async function getLegacyInventorySnapshot(): Promise<Map<string, LegacyArticleAggregate>> {
  // legacyService usa el pool de conexión global de mssql (sql.connect()), no uno
  // por llamada: dos consultas en paralelo contra Sevilla y Jerez compiten por el
  // mismo pool y una puede acabar ejecutándose contra el servidor equivocado
  // (visto en real: "Invalid column name 'ID_MATERIAL_SEVILLA'" al consultar Jerez
  // en paralelo con Sevilla). Se consultan en secuencia para evitar la carrera.
  const sevillaRows = await getLegacyArticlesWithRetry('SEVILLA')
  const jerezRows = await getLegacyArticlesWithRetry('JEREZ')

  const aggregated = aggregateLegacyArticles(sevillaRows, jerezRows)
  for (const code of EXCLUDED_INVENTORY_CODES) aggregated.delete(code)
  return aggregated
}

async function findOdooProductsByCodes(
  client: Odoo19Client,
  codes: string[]
): Promise<Map<string, Odoo19Product>> {
  const found = new Map<string, Odoo19Product>()
  const chunkSize = 200

  for (let i = 0; i < codes.length; i += chunkSize) {
    const chunk = codes.slice(i, i + chunkSize)
    const products = await client.searchRead<Odoo19Product>(
      'product.product',
      [['default_code', 'in', chunk]],
      ['id', 'default_code', 'name', 'rent_ok', 'active', 'type'],
      { active_test: false },
      1000
    )
    for (const product of products) {
      if (product.default_code) found.set(String(product.default_code), product)
    }
  }

  return found
}

function resolveStatus(product: Odoo19Product | undefined): { status: Odoo19InventoryStatus; odooProductId: number | null; reason?: string } {
  if (!product) return { status: 'to_create', odooProductId: null }
  if (product.active === false) {
    return { status: 'archived_pending', odooProductId: product.id, reason: 'Producto archivado en Odoo 19' }
  }
  if (!product.rent_ok) {
    return { status: 'archived_pending', odooProductId: product.id, reason: 'Producto existe pero rent_ok=false' }
  }
  if (product.type === 'service') {
    return { status: 'not_stockable', odooProductId: product.id, reason: 'Producto de tipo servicio en Odoo, no lleva inventario' }
  }
  return { status: 'healthy', odooProductId: product.id }
}

/**
 * Reconcilia el snapshot legacy contra el catálogo de Odoo 19: sano, a crear,
 * archivado pendiente, o revisión manual forzada (3666/4514). No escribe nada.
 */
export async function buildInventoryPreview(client: Odoo19Client): Promise<Odoo19InventoryPreview> {
  const legacySnapshot = await getLegacyInventorySnapshot()
  const codes = [...legacySnapshot.keys()].filter((code) => !MANUAL_REVIEW_CODES.includes(code))

  const odooProducts = await findOdooProductsByCodes(client, codes)

  const items: Odoo19InventoryItem[] = []
  for (const [code, legacy] of legacySnapshot) {
    if (MANUAL_REVIEW_CODES.includes(code)) {
      items.push({
        code,
        description: legacy.description,
        family: legacy.family,
        sevillaQty: legacy.sevillaQty,
        jerezQty: legacy.jerezQty,
        status: 'manual_review',
        odooProductId: null,
        reason: 'Requiere resolución manual en Odoo antes de reconciliar (ver PRP-ODOO-004)',
      })
      continue
    }

    const product = odooProducts.get(code)
    const resolved = resolveStatus(product)
    items.push({
      code,
      description: legacy.description,
      family: legacy.family,
      sevillaQty: legacy.sevillaQty,
      jerezQty: legacy.jerezQty,
      ...resolved,
    })
  }

  items.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

  return {
    items,
    excludedCodes: EXCLUDED_INVENTORY_CODES,
    totals: {
      healthy: items.filter((i) => i.status === 'healthy').length,
      toCreate: items.filter((i) => i.status === 'to_create').length,
      archivedPending: items.filter((i) => i.status === 'archived_pending').length,
      manualReview: items.filter((i) => i.status === 'manual_review').length,
      notStockable: items.filter((i) => i.status === 'not_stockable').length,
      excluded: EXCLUDED_INVENTORY_CODES.length,
    },
  }
}

let cachedUnitsUomId: number | null = null

/**
 * Resuelve el ID de la UoM "Units" por nombre (nunca hardcodeado): todos los
 * productos alquilables existentes ya usan esta unidad.
 */
async function resolveUnitsUomId(client: Odoo19Client): Promise<number> {
  if (cachedUnitsUomId !== null) return cachedUnitsUomId

  const uoms = await client.searchRead<{ id: number; name: string }>(
    'uom.uom',
    [['name', '=', 'Units']],
    ['id', 'name'],
    {},
    1
  )
  if (uoms.length === 0) throw new Error('No se encontró la unidad de medida "Units" en Odoo 19')
  cachedUnitsUomId = uoms[0].id
  return cachedUnitsUomId
}

/**
 * Crea un producto alquilable nuevo sin compañía asignada (uso compartido entre
 * Visueña y Stileum), con default_code numérico puro (sin prefijo ART-), igual
 * que el resto del catálogo ya existente en Odoo.
 */
async function createMissingProduct(client: Odoo19Client, item: Odoo19InventoryItem): Promise<number> {
  const uomId = await resolveUnitsUomId(client)
  return client.create(
    'product.product',
    {
      name: item.description,
      default_code: item.code,
      rent_ok: true,
      type: 'consu',
      is_storable: true,
      uom_id: uomId,
      company_id: false,
    },
    {}
  )
}

/**
 * Fija la cantidad de un producto en una ubicación de stock como ajuste de
 * inventario absoluto: busca el quant existente (o crea uno), fija
 * inventory_quantity y aplica el ajuste con action_apply_inventory. Nunca
 * escribe el campo quantity directamente (Odoo lo bloquea).
 */
async function applyProductQuant(
  client: Odoo19Client,
  productId: number,
  locationId: number,
  quantity: number,
  context: Record<string, unknown>
): Promise<void> {
  const existing = await client.searchRead<{ id: number }>(
    'stock.quant',
    [['product_id', '=', productId], ['location_id', '=', locationId]],
    ['id'],
    context,
    1
  )

  const quantId = existing.length > 0
    ? existing[0].id
    : await client.create('stock.quant', { product_id: productId, location_id: locationId, inventory_quantity: quantity }, context)

  if (existing.length > 0) {
    await client.write('stock.quant', [quantId], { inventory_quantity: quantity }, context)
  }

  await client.callMethod('stock.quant', 'action_apply_inventory', [quantId], context)
}

/**
 * Aplica la carga de inventario para los artículos "sanos" y "a crear" del
 * preview. No toca archivados pendientes, revisión manual, no-stockable ni
 * excluidos. Un fallo en un artículo/almacén no detiene el resto.
 */
export async function applyInventoryLoad(
  client: Odoo19Client,
  preview: Odoo19InventoryPreview
): Promise<Odoo19InventoryApplyResult> {
  const destinations = {
    SEVILLA: await resolveOdoo19Destination(client, 'SEVILLA'),
    JEREZ: await resolveOdoo19Destination(client, 'JEREZ'),
  } as const

  const applicable = preview.items.filter((item) => item.status === 'healthy' || item.status === 'to_create')
  const results: Odoo19InventoryAdjustmentResult[] = []

  for (const item of applicable) {
    let productId = item.odooProductId
    let createdProduct = false

    try {
      if (productId === null) {
        productId = await createMissingProduct(client, item)
        createdProduct = true
      }

      const perWarehouse: Array<{ code: 'SEVILLA' | 'JEREZ'; quantity: number | null }> = [
        { code: 'SEVILLA', quantity: item.sevillaQty },
        { code: 'JEREZ', quantity: item.jerezQty },
      ]

      for (const { code, quantity } of perWarehouse) {
        if (quantity === null) continue
        const destination = destinations[code]
        try {
          await applyProductQuant(client, productId, destination.stockLocationId, quantity, companyContext(destination.companyId))
          results.push({ code: item.code, description: item.description, warehouseCode: code, quantity, success: true, productId, createdProduct })
        } catch (error) {
          results.push({
            code: item.code,
            description: item.description,
            warehouseCode: code,
            quantity,
            success: false,
            productId,
            createdProduct,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } catch (error) {
      results.push({
        code: item.code,
        description: item.description,
        warehouseCode: 'SEVILLA',
        quantity: item.sevillaQty ?? item.jerezQty ?? 0,
        success: false,
        error: `No se pudo crear el producto: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  return {
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}
