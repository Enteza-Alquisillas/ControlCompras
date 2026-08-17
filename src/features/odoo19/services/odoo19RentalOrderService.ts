import type { Odoo19Partner, Odoo19Product, Odoo19RentalForExport } from '../types'
import type { Odoo19Client } from './odoo19Client'
import { companyContext, resolveOdoo19Destination } from './odoo19WarehouseResolver'

function rentalDates(deliveryDate: string, pickupDate: string): { start: string; end: string } {
  const start = `${deliveryDate} 00:00:00`
  const endTime = deliveryDate === pickupDate ? '23:59:59' : '20:00:00'
  return { start, end: `${pickupDate} ${endTime}` }
}

function normalizeVat(value: string | null | false): string | null {
  if (!value) return null
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.startsWith('ES') ? normalized.slice(2) || null : normalized || null
}

export class Odoo19RentalOrderService {
  private partnersByVat: Map<string, Odoo19Partner[]> | null = null

  constructor(private readonly client: Odoo19Client) {}

  async createRentalOrder(rental: Odoo19RentalForExport): Promise<{ orderId: number; companyCode: string }> {
    const destination = await resolveOdoo19Destination(this.client, rental.warehouse?.code)
    const context = companyContext(destination.companyId)
    const partnerId = await this.findPartner(rental.customer?.vat, rental.customer?.name, context)
    const lines = await this.buildRentalLines(rental, context)
    const dates = rentalDates(rental.deliveryDate, rental.pickupDate)

    const values: Record<string, unknown> = {
      company_id: destination.companyId,
      warehouse_id: destination.warehouseId,
      partner_id: partnerId,
      is_rental_order: true,
      rental_start_date: dates.start,
      rental_return_date: dates.end,
      event_date: rental.eventDate ?? rental.deliveryDate,
      order_line: lines,
    }

    if (rental.legacyId !== null) values.client_order_ref = `ENTEZA-${rental.legacyId}`
    const notes = [rental.deliveryAddress && `Dirección entrega: ${rental.deliveryAddress}`, rental.notes]
      .filter((note): note is string => Boolean(note))
    if (notes.length > 0) values.note = notes.join('\n')

    const orderId = await this.client.create('sale.order', values, context)
    return { orderId, companyCode: destination.code }
  }

  private async findPartner(
    vat: string | null | undefined,
    name: string | undefined,
    context: Record<string, unknown>
  ): Promise<number> {
    const normalizedVat = normalizeVat(vat ?? null)

    if (normalizedVat) {
      const matches = (await this.getPartnersByVat(context)).get(normalizedVat) ?? []

      if (matches.length === 1) return matches[0].id
      if (matches.length === 0) throw new Error(`No se encontró cliente en Odoo 19 con CIF/NIF ${normalizedVat}`)
      throw new Error(`Hay varios clientes en Odoo 19 con CIF/NIF ${normalizedVat}`)
    }

    if (!name) throw new Error('La reserva no tiene cliente ni CIF/NIF')

    const partners = await this.client.searchRead<Odoo19Partner>(
      'res.partner',
      [['name', '=', name]],
      ['id', 'name', 'vat'],
      context
    )
    if (partners.length !== 1) {
      throw new Error(`No se encontró un único cliente en Odoo 19 por nombre: ${name}. Sin CIF/NIF no se puede enlazar automáticamente.`)
    }
    return partners[0].id
  }

  private async getPartnersByVat(context: Record<string, unknown>): Promise<Map<string, Odoo19Partner[]>> {
    if (this.partnersByVat) return this.partnersByVat

    const partners = await this.client.searchRead<Odoo19Partner>(
      'res.partner',
      [['vat', '!=', false]],
      ['id', 'name', 'vat'],
      context,
      5000
    )
    this.partnersByVat = new Map<string, Odoo19Partner[]>()

    for (const partner of partners) {
      const vat = normalizeVat(partner.vat)
      if (!vat) continue
      const matches = this.partnersByVat.get(vat) ?? []
      matches.push(partner)
      this.partnersByVat.set(vat, matches)
    }

    return this.partnersByVat
  }

  private async buildRentalLines(
    rental: Odoo19RentalForExport,
    context: Record<string, unknown>
  ): Promise<Array<[0, 0, Record<string, unknown>]>> {
    if (rental.items.length === 0) throw new Error('La reserva no tiene artículos')

    const lines: Array<[0, 0, Record<string, unknown>]> = []
    for (const item of rental.items) {
      if (!item.article?.code) throw new Error(`Artículo sin referencia interna: ${item.article?.description ?? 'desconocido'}`)
      if (item.quantity <= 0) throw new Error(`Cantidad no válida para ${item.article.description}`)

      const productId = await this.findRentalProduct(item.article.code, context)
      lines.push([0, 0, {
        product_id: productId,
        product_uom_qty: item.quantity,
        is_rental: true,
      }])
    }
    return lines
  }

  private async findRentalProduct(code: string, context: Record<string, unknown>): Promise<number> {
    const numericCode = code.replace(/^ART-/i, '')
    const domain = [['default_code', 'in', [code, numericCode]]]
    const products = await this.client.searchRead<Odoo19Product>(
      'product.product',
      domain,
      ['id', 'name', 'default_code', 'rent_ok'],
      context
    )
    const product = products.find((candidate) => candidate.rent_ok)
    if (product) return product.id

    if (products.length > 0) {
      throw new Error(`El producto ${code} existe en Odoo 19 pero no tiene "Puede alquilarse" (rent_ok) activado.`)
    }

    const archived = await this.client.searchRead<Odoo19Product>(
      'product.product',
      domain,
      ['id', 'name', 'default_code', 'rent_ok', 'active'],
      { ...context, active_test: false }
    )
    const archivedMatch = archived.find((candidate) => candidate.active === false)
    if (archivedMatch) {
      throw new Error(`El producto ${code} existe en Odoo 19 pero está archivado (inactivo). Reactívalo en Odoo antes de exportar.`)
    }

    throw new Error(`Producto no encontrado o no alquilable en Odoo 19: ${code}`)
  }
}
