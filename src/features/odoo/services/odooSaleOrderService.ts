import type { OdooClient } from './odooClient'
import type { OdooPartner, OdooProduct, RentalForExport } from '../types'

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

  async findProductByCode(code: string): Promise<number | null> {
    const results = await this.client.searchRead<OdooProduct>(
      'product.product',
      [['default_code', '=', code]],
      ['id', 'name', 'default_code'],
      1
    )
    return results.length > 0 ? results[0].id : null
  }

  async createSaleOrder(rental: RentalForExport): Promise<number> {
    const customerName = rental.customer?.name ?? 'Cliente desconocido'
    const partnerId = await this.findOrCreatePartner(
      customerName,
      rental.customer?.email ?? undefined
    )

    // Build order lines — Odoo many2many command [0, 0, values] = create new record
    const orderLines: [0, 0, Record<string, unknown>][] = []

    for (const item of rental.items) {
      if (!item.article) continue

      const lineValues: Record<string, unknown> = {
        product_uom_qty: item.quantity,
        name: item.article.description,
        price_unit: 0,
      }

      if (item.article.code) {
        const productId = await this.findProductByCode(item.article.code)
        if (productId) {
          lineValues.product_id = productId
        } else {
          // Product not found in Odoo — use manual description with code prefix
          lineValues.name = `[${item.article.code}] ${item.article.description}`
        }
      }

      orderLines.push([0, 0, lineValues])
    }

    const orderValues: Record<string, unknown> = {
      partner_id: partnerId,
      date_order: `${rental.event_date} 00:00:00`,
      commitment_date: `${rental.delivery_date} 00:00:00`,
      validity_date: rental.pickup_date,
      order_line: orderLines,
    }

    if (rental.legacy_id) {
      orderValues.client_order_ref = `ENTEZA-${rental.legacy_id}`
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

    return this.client.create('sale.order', orderValues)
  }
}
