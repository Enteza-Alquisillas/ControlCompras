'use server'

import { createClient } from '@/lib/supabase/server'
import { createOdooClient } from '../services/odooClient'
import { OdooSaleOrderService } from '../services/odooSaleOrderService'
import type { OdooExportBatchResult, OdooExportPayload, OdooExportResult, RentalForExport } from '../types'

export async function unmarkRentalOdooExport(rentalId: string): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { error } = await (supabase as any)
    .from('rentals')
    .update({ odoo_order_id: null, odoo_synced_at: null })
    .eq('id', rentalId)

  if (error) throw new Error(`Error al quitar la marca: ${error.message}`)
}

async function loadRentalsForIds(rentalIds: string[]): Promise<RentalForExport[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('rentals')
    .select(`
      id, legacy_id, event_date, delivery_date, pickup_date,
      delivery_address, notes, status, odoo_order_id, odoo_synced_at,
      warehouse:warehouses!warehouse_id (id, code),
      customer:customers!customer_id (id, name, email, phone),
      items:rental_items (
        id, quantity,
        article:articles!article_id (id, code, description)
      )
    `)
    .in('id', rentalIds)
    .neq('status', 'cancelled')

  if (error) throw new Error(`Error cargando pedidos: ${error.message}`)

  return ((data ?? []) as unknown[]).map((rental) => {
    const r = rental as Record<string, unknown>

    const rawWarehouse = r.warehouse as unknown
    const warehouse = Array.isArray(rawWarehouse)
      ? (rawWarehouse[0] as RentalForExport['warehouse']) ?? null
      : (rawWarehouse as RentalForExport['warehouse'])

    const rawCustomer = r.customer as unknown
    const customer = Array.isArray(rawCustomer)
      ? (rawCustomer[0] as RentalForExport['customer']) ?? null
      : (rawCustomer as RentalForExport['customer'])

    const rawItems = (r.items as unknown[]) ?? []
    const items = rawItems.map((it) => {
      const item = it as { id: string; quantity: number; article: unknown }
      const rawArticle = item.article
      const article = Array.isArray(rawArticle)
        ? (rawArticle[0] as RentalForExport['items'][number]['article']) ?? null
        : (rawArticle as RentalForExport['items'][number]['article'])
      return { id: item.id, quantity: item.quantity, article }
    })

    return {
      id: r.id as string,
      legacy_id: r.legacy_id as number | null,
      event_date: (r.event_date as string) ?? '',
      delivery_date: r.delivery_date as string,
      pickup_date: r.pickup_date as string,
      delivery_address: r.delivery_address as string | null,
      notes: r.notes as string | null,
      status: r.status as string | null,
      odoo_order_id: r.odoo_order_id as number | null,
      odoo_synced_at: r.odoo_synced_at as string | null,
      warehouse,
      customer,
      items,
      itemCount: items.length,
    }
  })
}

export async function exportRentalsToOdoo(
  payload: OdooExportPayload
): Promise<OdooExportBatchResult> {
  if (!payload.rentalIds || payload.rentalIds.length === 0) {
    return { total: 0, successful: 0, failed: 0, results: [] }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const rentalsToExport = await loadRentalsForIds(payload.rentalIds)

  if (rentalsToExport.length === 0) {
    return { total: 0, successful: 0, failed: 0, results: [] }
  }

  const odooClient = createOdooClient()
  await odooClient.authenticate()
  const saleOrderService = new OdooSaleOrderService(odooClient)

  const results: OdooExportResult[] = []

  for (const rental of rentalsToExport) {
    try {
      const odooOrderId = await saleOrderService.createSaleOrder(rental)

      await (supabase as any)
        .from('rentals')
        .update({ odoo_order_id: odooOrderId, odoo_synced_at: new Date().toISOString() })
        .eq('id', rental.id)

      results.push({
        rentalId: rental.id,
        rentalLegacyId: rental.legacy_id,
        customerName: rental.customer?.name ?? 'Desconocido',
        success: true,
        odooOrderId,
      })
    } catch (error) {
      results.push({
        rentalId: rental.id,
        rentalLegacyId: rental.legacy_id,
        customerName: rental.customer?.name ?? 'Desconocido',
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
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
