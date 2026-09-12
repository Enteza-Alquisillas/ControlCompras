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

/**
 * Cliente genérico en Odoo 19 para reservas cuyo cliente no se pudo enlazar de
 * forma inequívoca. Nunca se crea un partner nuevo automáticamente.
 */
const GENERIC_CUSTOMER_NAME = 'CLIENTES VARIOS'

const DEFAULT_FISCAL_POSITION_COUNTRY_CODE = 'ES'

export class Odoo19RentalOrderService {
  private partnersByVat: Map<string, Odoo19Partner[]> | null = null
  private defaultFiscalPositionByCompany = new Map<number, number>()
  private defaultFiscalPositionCountryId: number | null = null

  constructor(private readonly client: Odoo19Client) {}

  async createRentalOrder(rental: Odoo19RentalForExport): Promise<{ orderId: number; companyCode: string }> {
    const destination = await resolveOdoo19Destination(this.client, rental.warehouse?.code)
    const context = companyContext(destination.companyId)
    const existingOrderId = await this.findExistingOrder(rental.legacyId, destination.companyId, context)
    if (existingOrderId !== null) return { orderId: existingOrderId, companyCode: destination.code }

    const partnerId = await this.findPartner(rental.customer?.vat, rental.customer?.name, context)
    const fiscalPositionId = await this.resolveFiscalPositionId(partnerId, destination.companyId, context)
    const lines = await this.buildRentalLines(rental, context)
    const dates = rentalDates(rental.deliveryDate, rental.pickupDate)

    const values: Record<string, unknown> = {
      company_id: destination.companyId,
      warehouse_id: destination.warehouseId,
      partner_id: partnerId,
      fiscal_position_id: fiscalPositionId,
      is_rental_order: true,
      rental_start_date: dates.start,
      rental_return_date: dates.end,
      event_date: rental.eventDate ?? rental.deliveryDate,
      order_line: lines,
    }

    if (rental.legacyId !== null) {
      // Igual que en la exportación a Odoo 15: el número de contrato del legacy
      // se copia como número de pedido (name), no solo como referencia de cliente.
      values.name = String(rental.legacyId)
      values.client_order_ref = `ENTEZA-${rental.legacyId}`
    }
    const notes = [rental.deliveryAddress && `Dirección entrega: ${rental.deliveryAddress}`, rental.notes]
      .filter((note): note is string => Boolean(note))
    if (notes.length > 0) values.note = notes.join('\n')

    const orderId = await this.client.create('sale.order', values, context)
    return { orderId, companyCode: destination.code }
  }

  /**
   * A failed HTTP response does not prove that Odoo rolled the transaction
   * back. The legacy contract number is our stable idempotency key, so reuse
   * an existing order instead of creating a duplicate on a later retry.
   */
  private async findExistingOrder(
    legacyId: number | null,
    companyId: number,
    context: Record<string, unknown>
  ): Promise<number | null> {
    if (legacyId === null) return null

    const orders = await this.client.searchRead<{ id: number }>(
      'sale.order',
      ['|', ['client_order_ref', '=', `ENTEZA-${legacyId}`], ['name', '=', String(legacyId)], ['company_id', '=', companyId]],
      ['id'],
      context,
      2
    )
    if (orders.length > 1) {
      throw new Error(`Hay varios pedidos de Odoo 19 para el contrato ${legacyId} en la compañía ${companyId}; revísalos antes de reintentar.`)
    }
    return orders[0]?.id ?? null
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
    } else if (name) {
      const partners = await this.client.searchRead<Odoo19Partner>(
        'res.partner',
        [['name', '=', name]],
        ['id', 'name', 'vat'],
        context
      )
      if (partners.length === 1) return partners[0].id
    }

    return this.findGenericCustomer(context)
  }

  /**
   * El cliente no se pudo enlazar de forma inequívoca (no existe, hay CIF/NIF
   * duplicado en Odoo, o la reserva no trae CIF/NIF y el nombre no es único).
   * En vez de bloquear el traspaso, se asigna el cliente genérico para que se
   * revise y corrija manualmente en Odoo. Nunca se crea un partner nuevo.
   */
  private async findGenericCustomer(context: Record<string, unknown>): Promise<number> {
    const generic = await this.client.searchRead<Odoo19Partner>(
      'res.partner',
      [['name', '=', GENERIC_CUSTOMER_NAME]],
      ['id', 'name'],
      context
    )
    if (generic.length === 0) {
      throw new Error(
        `No se encontró el cliente en Odoo 19 y tampoco existe el cliente genérico "${GENERIC_CUSTOMER_NAME}" para usarlo como respaldo.`
      )
    }
    return generic[0].id
  }

  /**
   * Odoo calcula fiscal_position_id como campo computado (_compute_fiscal_position),
   * pero al crear el pedido vía API (create() directo, sin pasar por el onchange del
   * formulario web) esa detección automática puede no aplicar la posición fiscal
   * correcta. Se fija explícitamente: la propia del cliente si la tiene configurada,
   * o la posición doméstica española configurada para la compañía.
   */
  private async resolveFiscalPositionId(
    partnerId: number,
    companyId: number,
    context: Record<string, unknown>
  ): Promise<number> {
    const [partner] = await this.client.searchRead<Odoo19Partner>(
      'res.partner',
      [['id', '=', partnerId]],
      ['id', 'property_account_position_id'],
      context
    )
    if (partner?.property_account_position_id) return partner.property_account_position_id[0]

    return this.getDefaultFiscalPositionId(companyId, context)
  }

  private async getDefaultFiscalPositionId(companyId: number, context: Record<string, unknown>): Promise<number> {
    const cached = this.defaultFiscalPositionByCompany.get(companyId)
    if (cached) return cached

    const countryId = await this.getDefaultFiscalPositionCountryId(context)
    const positions = await this.client.searchRead<{ id: number; name: string }>(
      'account.fiscal.position',
      [
        ['company_id', 'in', [companyId, false]],
        ['country_id', '=', countryId],
        ['auto_apply', '=', true],
      ],
      ['id', 'name'],
      context
    )
    if (positions.length === 0) {
      throw new Error(
        `No se encontró una posición fiscal doméstica española configurada en Odoo 19 para la compañía ${companyId}.`
      )
    }

    this.defaultFiscalPositionByCompany.set(companyId, positions[0].id)
    return positions[0].id
  }

  private async getDefaultFiscalPositionCountryId(context: Record<string, unknown>): Promise<number> {
    if (this.defaultFiscalPositionCountryId !== null) return this.defaultFiscalPositionCountryId

    const countries = await this.client.searchRead<{ id: number }>(
      'res.country',
      [['code', '=', DEFAULT_FISCAL_POSITION_COUNTRY_CODE]],
      ['id'],
      context,
      1
    )
    if (countries.length === 0) throw new Error('No se encontró España en la configuración de países de Odoo 19.')

    this.defaultFiscalPositionCountryId = countries[0].id
    return this.defaultFiscalPositionCountryId
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

      const product = await this.findProduct(item.article.code, context)
      lines.push([0, 0, {
        product_id: product.id,
        product_uom_qty: item.quantity,
        // Odoo is the source of truth for whether a line is rented or sold.
        is_rental: product.rent_ok,
      }])
    }
    return lines
  }

  private async findProduct(code: string, context: Record<string, unknown>): Promise<Odoo19Product> {
    const numericCode = code.replace(/^ART-/i, '')
    const domain = [['default_code', 'in', [code, numericCode]]]
    const products = await this.client.searchRead<Odoo19Product>(
      'product.product',
      domain,
      ['id', 'name', 'default_code', 'rent_ok'],
      context
    )
    const product = products[0]
    if (product) return product

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
