'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createOdoo19Client } from '../services/odoo19Client'
import { Odoo19RentalOrderService } from '../services/odoo19RentalOrderService'
import { mapRentals } from '../services/rentalsOdoo19ExportService'
import type { Odoo19ExportBatchResult, Odoo19ExportResult, Odoo19RentalForExport } from '../types'

const exportPayloadSchema = z.object({
  rentalIds: z.array(z.string().uuid()).min(1).max(100),
})

interface RentalsWriter {
  from(table: 'rentals'): {
    update(values: {
      odoo19_order_id: number | null
      odoo19_synced_at: string | null
      odoo19_company_code: string | null
    }): {
      eq(column: 'id', value: string): Promise<{ error: { message: string } | null }>
    }
  }
}

async function loadRentals(rentalIds: string[]): Promise<Odoo19RentalForExport[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rentals')
    .select(`
      id, legacy_id, event_date, delivery_date, pickup_date, delivery_address, notes,
      odoo19_order_id, odoo19_synced_at, odoo19_company_code,
      warehouse:warehouses!warehouse_id (id, code),
      customer:customers!customer_id (id, name, email, phone),
      items:rental_items (id, quantity, article:articles!article_id (id, code, description))
    `)
    .in('id', rentalIds)
    .neq('status', 'cancelled')

  if (error) throw new Error(`Error cargando pedidos: ${error.message}`)
  return mapRentals((data ?? []) as unknown as Record<string, unknown>[])
}

export async function exportRentalsToOdoo19(input: unknown): Promise<Odoo19ExportBatchResult> {
  const { rentalIds } = exportPayloadSchema.parse(input)
  const supabase = await createClient()
  const rentalsWriter = supabase as unknown as RentalsWriter
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const rentals = await loadRentals(rentalIds)
  const client = createOdoo19Client()
  const rentalService = new Odoo19RentalOrderService(client)
  const results: Odoo19ExportResult[] = []

  for (const rental of rentals) {
    const customerName = rental.customer?.name ?? 'Desconocido'
    try {
      if (rental.odoo19OrderId !== null) {
        throw new Error(`La reserva ya está exportada a Odoo 19 como pedido #${rental.odoo19OrderId}`)
      }

      const { orderId, companyCode } = await rentalService.createRentalOrder(rental)
      const { error } = await rentalsWriter
        .from('rentals')
        .update({
          odoo19_order_id: orderId,
          odoo19_synced_at: new Date().toISOString(),
          odoo19_company_code: companyCode,
        })
        .eq('id', rental.id)

      if (error) throw new Error(`El pedido #${orderId} se creó en Odoo 19, pero no se pudo guardar la trazabilidad: ${error.message}`)
      results.push({ rentalId: rental.id, rentalLegacyId: rental.legacyId, customerName, success: true, odooOrderId: orderId })
    } catch (error) {
      results.push({
        rentalId: rental.id,
        rentalLegacyId: rental.legacyId,
        customerName,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido al exportar a Odoo 19',
      })
    }
  }

  return {
    total: results.length,
    successful: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  }
}

export async function unmarkRentalOdoo19Export(rentalId: string): Promise<void> {
  z.string().uuid().parse(rentalId)
  const supabase = await createClient()
  const rentalsWriter = supabase as unknown as RentalsWriter
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { error } = await rentalsWriter
    .from('rentals')
    .update({ odoo19_order_id: null, odoo19_synced_at: null, odoo19_company_code: null })
    .eq('id', rentalId)
  if (error) throw new Error(`Error al quitar la marca de Odoo 19: ${error.message}`)
}
