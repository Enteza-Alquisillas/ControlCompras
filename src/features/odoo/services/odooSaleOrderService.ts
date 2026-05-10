import type { OdooClient } from './odooClient'
import type { OdooPartner, OdooProduct, OdooProductMatch, RentalForExport } from '../types'

export class OdooSaleOrderService {
  constructor(private client: OdooClient) {}

  async findOrCreatePartner(name: string, email?: string): Promise<number> {
    const results = await this.client.searchRead<OdooPartner>(
      'res.partner',
      [['name', '=', name]],
      ['id', 'name', 'email'],
      1
    )

    if (results.length > 0) {
      return results[0].id
    }

    return this.client.create('res.partner', {
      name,
      email: email ?? false,
      customer_rank: 1,
    })
  }

  /**
   * Given a Supabase article code (e.g. "ART-2646"):
   * 1. Strip "ART-" prefix → "2646"
   * 2. Find the PHYSICAL product in Odoo by default_code = "2646"
   * 3. Return its product_rental_day_id (the rental SERVICE product to use on order lines)
   */
  async findProductByCode(code: string): Promise<OdooProductMatch | null> {
    const numericCode = code.replace(/^ART-/i, '')
    if (!numericCode) return null

    const results = await this.client.searchRead<OdooProduct>(
      'product.product',
      [['default_code', '=', numericCode]],
      ['id', 'name', 'default_code', 'uom_id', 'product_rental_day_id'],
      1
    )
    if (results.length === 0) return null

    const product = results[0]

    if (!product.product_rental_day_id) return null

    // product_rental_day_id is a many2one: [id, name] or false
    const rentalServiceId = Array.isArray(product.product_rental_day_id)
      ? product.product_rental_day_id[0]
      : (product.product_rental_day_id as unknown as number)

    // uomId=3 is "Days" — all rental service products use this UoM
    // physicalProductId is required as display_product_id on the line so Odoo's rental UI
    // recognises the order as a true rental (sets rental_ok=true, populates warehouses_id, etc.)
    return { id: rentalServiceId, uomId: 3, physicalProductId: product.id }
  }

  // Map Supabase warehouse code to Odoo stock.warehouse id
  private odooWarehouseId(warehouseCode: string | undefined | null): number {
    if (warehouseCode?.toUpperCase() === 'JEREZ') return 2
    return 1 // SEVILLA (default — sale.order.type id=2 also defaults to 1)
  }

  async createSaleOrder(rental: RentalForExport): Promise<number> {
    const customerName = rental.customer?.name ?? 'Cliente desconocido'
    const partnerId = await this.findOrCreatePartner(
      customerName,
      rental.customer?.email ?? undefined
    )

    const warehouseId = this.odooWarehouseId(rental.warehouse?.code)
    const orderLines: [0, 0, Record<string, unknown>][] = []

    for (const item of rental.items) {
      if (!item.article) continue

      const numericCode = item.article.code?.replace(/^ART-/i, '') ?? ''

      // Base line values — rental fields required by Odoo
      // name is intentionally omitted so Odoo auto-fills it from the product
      const lineValues: Record<string, unknown> = {
        product_uom_qty: item.quantity,
        rental_qty: item.quantity,
        price_unit: 0,
        customer_lead: 0,
        // Mark this line as a rental line
        rental: true,
        rental_type: 'new_rental',
        // Rental date range propagated to each line
        start_date: rental.delivery_date,
        end_date: rental.pickup_date,
        default_start_date: rental.delivery_date,
        default_end_date: rental.pickup_date,
        // Warehouse must be set on every line (warehouse_id = standard field,
        // warehouses_id = rental-module alias used by Odoo's rental UI)
        warehouse_id: warehouseId,
        warehouses_id: warehouseId,
      }

      if (item.article.code) {
        const match = await this.findProductByCode(item.article.code)
        if (match) {
          // Found the rental service product — use it as a proper rental line.
          // display_product_id (the PHYSICAL product) is what Odoo's rental UI uses to
          // identify the rented item; without it rental_ok stays false and the order
          // isn't treated as a true rental quotation.
          lineValues.product_id = match.id
          lineValues.product_uom = match.uomId
          lineValues.display_product_id = match.physicalProductId
        } else {
          // Product not in Odoo or has no rental service.
          // Constraint sale_order_line_accountable_required_fields requires product_id+product_uom
          // when display_type IS NULL. Use line_note to avoid the violation.
          const label = numericCode
            ? `[${numericCode}] ${item.article.description}`
            : item.article.description
          orderLines.push([0, 0, { display_type: 'line_note', name: label }])
          continue
        }
      } else {
        // No code at all — also insert as a note line
        orderLines.push([0, 0, { display_type: 'line_note', name: item.article.description }])
        continue
      }

      orderLines.push([0, 0, lineValues])
    }

    if (orderLines.length === 0) {
      throw new Error('El pedido no tiene líneas de artículos válidas')
    }

    // type_id=2 is "Rental Order" in this Odoo 15 instance (sale.order.type)
    const orderValues: Record<string, unknown> = {
      type_id: 2,
      warehouse_id: warehouseId,
      partner_id: partnerId,
      date_order: `${rental.event_date} 00:00:00`,
      // Rental date range at order level (shown in Odoo rental view)
      default_start_date: rental.delivery_date,
      default_end_date: rental.pickup_date,
      // Custom field "Fecha Evento" present in this Odoo instance
      event_date: rental.event_date,
      order_line: orderLines,
    }

    // Contract number from SQL Server as customer reference. Order name is left to Odoo's
    // Rental Order sequence (produces "RO####"), matching what UI-created rental quotations get.
    if (rental.legacy_id) {
      orderValues.name = String(rental.legacy_id)
    }

    const noteLines: string[] = []
    if (rental.delivery_address) {
      noteLines.push(`Dirección entrega: ${rental.delivery_address}`)
    }
    if (rental.notes) {
      noteLines.push(rental.notes)
    }
    if (noteLines.length > 0) {
      orderValues.note = noteLines.join('\n')
    }

    const orderId = await this.client.create('sale.order', orderValues)

    // Confirmar el pedido para que el módulo OCA Rental genere los registros
    // sale.rental y el pedido aparezca en la app Alquiler (no solo en Ventas)
    await this.client.callKw('sale.order', 'action_confirm', [[orderId]])

    return orderId
  }
}
