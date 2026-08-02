import { createClient } from '@/lib/supabase/client'
import type { Odoo19RentalForExport } from '../types'

function mapRentals(data: Record<string, unknown>[]): Odoo19RentalForExport[] {
  return data.map((rental) => {
    const customer = Array.isArray(rental.customer) ? rental.customer[0] ?? null : rental.customer
    const warehouse = Array.isArray(rental.warehouse) ? rental.warehouse[0] ?? null : rental.warehouse
    const items = ((rental.items as unknown[]) ?? []).map((value) => {
      const item = value as { id: string; quantity: number; article: unknown }
      return {
        id: item.id,
        quantity: item.quantity,
        article: Array.isArray(item.article) ? item.article[0] ?? null : item.article,
      }
    })

    return {
      id: rental.id as string,
      legacyId: rental.legacy_id as number | null,
      eventDate: rental.event_date as string | null,
      deliveryDate: rental.delivery_date as string,
      pickupDate: rental.pickup_date as string,
      deliveryAddress: rental.delivery_address as string | null,
      notes: rental.notes as string | null,
      odoo19CompanyCode: rental.odoo19_company_code as string | null,
      odoo19OrderId: rental.odoo19_order_id as number | null,
      odoo19SyncedAt: rental.odoo19_synced_at as string | null,
      warehouse: warehouse as Odoo19RentalForExport['warehouse'],
      customer: customer as Odoo19RentalForExport['customer'],
      items: items as Odoo19RentalForExport['items'],
      itemCount: items.length,
    }
  })
}

export async function getRentalsForOdoo19Export(
  startDate: string,
  endDate: string
): Promise<Odoo19RentalForExport[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rentals')
    .select(`
      id, legacy_id, event_date, delivery_date, pickup_date, delivery_address, notes,
      odoo19_order_id, odoo19_synced_at, odoo19_company_code,
      warehouse:warehouses!warehouse_id (id, code),
      customer:customers!customer_id (id, name, email, phone, vat),
      items:rental_items (id, quantity, article:articles!article_id (id, code, description))
    `)
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true })

  if (error) throw new Error(`Error cargando pedidos: ${error.message}`)
  return mapRentals((data ?? []) as unknown as Record<string, unknown>[])
}

export { mapRentals }
