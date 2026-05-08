import { createClient } from '@/lib/supabase/client'
import type { RentalForExport } from '../types'

function mapRentals(data: Record<string, unknown>[]): RentalForExport[] {
  return data.map((rental) => {
    const rawCustomer = rental.customer as unknown
    const customer = Array.isArray(rawCustomer)
      ? (rawCustomer[0] as RentalForExport['customer']) ?? null
      : (rawCustomer as RentalForExport['customer'])

    const rawItems = (rental.items as unknown[]) ?? []
    const items = rawItems.map((it) => {
      const item = it as { id: string; quantity: number; article: unknown }
      const rawArticle = item.article
      const article = Array.isArray(rawArticle)
        ? (rawArticle[0] as RentalForExport['items'][number]['article']) ?? null
        : (rawArticle as RentalForExport['items'][number]['article'])
      return { id: item.id, quantity: item.quantity, article }
    })

    return {
      id: rental.id as string,
      legacy_id: rental.legacy_id as number | null,
      event_date: (rental.event_date as string) ?? '',
      delivery_date: rental.delivery_date as string,
      pickup_date: rental.pickup_date as string,
      delivery_address: rental.delivery_address as string | null,
      notes: rental.notes as string | null,
      status: rental.status as string | null,
      odoo_order_id: rental.odoo_order_id as number | null,
      odoo_synced_at: rental.odoo_synced_at as string | null,
      customer,
      items,
      itemCount: items.length,
    }
  })
}

// Used by the browser hook (useRentalsForExport)
export async function getRentalsForExportBrowser(
  startDate: string,
  endDate: string
): Promise<RentalForExport[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('rentals')
    .select(`
      id, legacy_id, event_date, delivery_date, pickup_date,
      delivery_address, notes, status, odoo_order_id, odoo_synced_at,
      customer:customers!customer_id (id, name, email, phone),
      items:rental_items (
        id, quantity,
        article:articles!article_id (id, code, description)
      )
    `)
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true })

  if (error) throw new Error(`Error cargando pedidos: ${error.message}`)

  return mapRentals((data ?? []) as unknown as Record<string, unknown>[])
}
