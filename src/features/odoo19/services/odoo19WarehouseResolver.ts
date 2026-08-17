import type { Odoo19Company, Odoo19Warehouse } from '../types'
import type { Odoo19Client } from './odoo19Client'

export interface Odoo19Destination {
  code: 'VISUENA' | 'STILEUM'
  companyId: number
  warehouseId: number
  stockLocationId: number
}

export function companyContext(companyId: number): Record<string, unknown> {
  return {
    allowed_company_ids: [companyId],
    company_id: companyId,
    tracking_disable: true,
    mail_create_nolog: true,
    mail_notrack: true,
    mail_create_nosubscribe: true,
  }
}

/**
 * Resuelve compañía + almacén + ubicación de stock a partir del código de
 * almacén de origen (SEVILLA/JEREZ), siempre por nombre/código, nunca por ID fijo.
 * Compartido entre la exportación de pedidos y la carga de inventario.
 */
export async function resolveOdoo19Destination(
  client: Odoo19Client,
  warehouseCode: string | undefined
): Promise<Odoo19Destination> {
  const normalized = warehouseCode?.trim().toUpperCase()
  const mapping = normalized === 'SEVILLA'
    ? { code: 'VISUENA' as const, companyName: client.companyNames.sevilla }
    : normalized === 'JEREZ'
      ? { code: 'STILEUM' as const, companyName: client.companyNames.jerez }
      : null

  if (!mapping) throw new Error(`Almacén de origen no válido para Odoo 19: ${warehouseCode ?? 'sin asignar'}`)

  const companies = await client.searchRead<Odoo19Company>(
    'res.company',
    [['name', '=', mapping.companyName]],
    ['id', 'name']
  )
  if (companies.length !== 1) throw new Error(`No se encontró una única compañía Odoo 19 para ${mapping.companyName}`)

  const warehouses = await client.searchRead<Odoo19Warehouse>(
    'stock.warehouse',
    [['company_id', '=', companies[0].id]],
    ['id', 'name', 'company_id', 'lot_stock_id'],
    companyContext(companies[0].id)
  )
  if (warehouses.length !== 1) {
    throw new Error(`La compañía ${companies[0].name} debe tener exactamente un almacén operativo en Odoo 19`)
  }
  if (!warehouses[0].lot_stock_id) {
    throw new Error(`El almacén de ${companies[0].name} no tiene ubicación de stock (lot_stock_id) configurada`)
  }

  return {
    code: mapping.code,
    companyId: companies[0].id,
    warehouseId: warehouses[0].id,
    stockLocationId: warehouses[0].lot_stock_id[0],
  }
}
