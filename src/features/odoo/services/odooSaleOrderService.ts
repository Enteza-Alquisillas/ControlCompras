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
   * Batch lookup: resolve many Supabase article codes ("ART-2646", ...) in a single
   * Odoo RPC. Returns a Map keyed by the original code (with "ART-" prefix preserved).
   * Codes whose physical product is missing or has no rental service are absent from
   * the map — callers treat that as "not found" and fall back to a note line.
   */
  async findProductsByCodes(codes: string[]): Promise<Map<string, OdooProductMatch>> {
    const result = new Map<string, OdooProductMatch>()

    const codeMap = new Map<string, string>() // numericCode → originalCode
    for (const code of codes) {
      const numeric = code.replace(/^ART-/i, '')
      if (numeric) codeMap.set(numeric, code)
    }
    if (codeMap.size === 0) return result

    const products = await this.client.searchRead<OdooProduct>(
      'product.product',
      [['default_code', 'in', Array.from(codeMap.keys())]],
      ['id', 'name', 'default_code', 'uom_id', 'product_rental_day_id'],
      codeMap.size
    )

    for (const product of products) {
      if (!product.default_code) continue
      const originalCode = codeMap.get(product.default_code)
      if (!originalCode) continue
      if (!product.product_rental_day_id) continue

      // product_rental_day_id is a many2one: [id, name] or false
      const rentalServiceId = Array.isArray(product.product_rental_day_id)
        ? product.product_rental_day_id[0]
        : (product.product_rental_day_id as unknown as number)

      // uomId=3 is "Days" — all rental service products use this UoM.
      // physicalProductId is required as display_product_id on the line so Odoo's
      // rental UI recognises the order as a true rental.
      result.set(originalCode, { id: rentalServiceId, uomId: 3, physicalProductId: product.id })
    }

    return result
  }

  // Map Supabase warehouse code to Odoo stock.warehouse id
  private odooWarehouseId(warehouseCode: string | undefined | null): number {
    if (warehouseCode?.toUpperCase() === 'JEREZ') return 2
    return 1 // SEVILLA (default — sale.order.type id=2 also defaults to 1)
  }

  async createSaleOrder(rental: RentalForExport): Promise<number> {
    const customerName = rental.customer?.name ?? 'Cliente desconocido'
    const warehouseId = this.odooWarehouseId(rental.warehouse?.code)

    // Run partner lookup in parallel with the batch product lookup — they're independent.
    const codes = rental.items
      .map((it) => it.article?.code)
      .filter((c): c is string => !!c)
    const uniqueCodes = Array.from(new Set(codes))

    const [partnerId, productsByCode] = await Promise.all([
      this.findOrCreatePartner(customerName, rental.customer?.email ?? undefined),
      this.findProductsByCodes(uniqueCodes),
    ])

    const orderLines: [0, 0, Record<string, unknown>][] = []

    for (const item of rental.items) {
      if (!item.article) continue

      const numericCode = item.article.code?.replace(/^ART-/i, '') ?? ''

      if (!item.article.code) {
        // No code at all — insert as a note line
        orderLines.push([0, 0, { display_type: 'line_note', name: item.article.description }])
        continue
      }

      const match = productsByCode.get(item.article.code)
      if (!match) {
        // Product not in Odoo or has no rental service.
        // Constraint sale_order_line_accountable_required_fields requires product_id+product_uom
        // when display_type IS NULL. Use line_note to avoid the violation.
        const label = numericCode
          ? `[${numericCode}] ${item.article.description}`
          : item.article.description
        orderLines.push([0, 0, { display_type: 'line_note', name: label }])
        continue
      }

      // Base line values — rental fields required by Odoo.
      // name is intentionally omitted so Odoo auto-fills it from the product.
      // display_product_id (PHYSICAL product) is what Odoo's rental UI uses to
      // identify the rented item; without it the order isn't treated as a true rental.
      orderLines.push([0, 0, {
        product_id: match.id,
        product_uom: match.uomId,
        display_product_id: match.physicalProductId,
        product_uom_qty: item.quantity,
        rental_qty: item.quantity,
        customer_lead: 0,
        rental: true,
        rental_type: 'new_rental',
        start_date: rental.delivery_date,
        end_date: rental.pickup_date,
        default_start_date: rental.delivery_date,
        default_end_date: rental.pickup_date,
        warehouse_id: warehouseId,
        warehouses_id: warehouseId,
      }])
    }

    if (orderLines.length === 0) {
      throw new Error('El pedido no tiene líneas de artículos válidas')
    }

    // type_id=2 is "Rental Order" in this Odoo 15 instance (sale.order.type).
    // The event date is preserved via date_order; the rental window via default_start/end_date.
    const orderValues: Record<string, unknown> = {
      type_id: 2,
      warehouse_id: warehouseId,
      partner_id: partnerId,
      date_order: `${rental.event_date} 00:00:00`,
      event_date: rental.event_date,
      default_start_date: rental.delivery_date,
      default_end_date: rental.pickup_date,
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

    // Se deja como presupuesto (draft). type_id=2 ("Rental Order") + líneas con
    // display_product_id deberían bastar para que el módulo OCA muestre el
    // presupuesto en la app Alquiler sin necesidad de confirmarlo.

    return orderId
  }
}
