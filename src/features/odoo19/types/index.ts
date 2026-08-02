export interface Odoo19RentalForExport {
  id: string
  legacyId: number | null
  eventDate: string | null
  deliveryDate: string
  pickupDate: string
  deliveryAddress: string | null
  notes: string | null
  odoo19CompanyCode: string | null
  odoo19OrderId: number | null
  odoo19SyncedAt: string | null
  warehouse: { id: string; code: string } | null
  customer: { id: string; name: string; email: string | null; phone: string | null; vat: string | null } | null
  items: Array<{
    id: string
    quantity: number
    article: { id: string; code: string | null; description: string } | null
  }>
  itemCount: number
}

export interface Odoo19ExportResult {
  rentalId: string
  rentalLegacyId: number | null
  customerName: string
  success: boolean
  odooOrderId?: number
  error?: string
}

export interface Odoo19ExportBatchResult {
  total: number
  successful: number
  failed: number
  results: Odoo19ExportResult[]
}

export interface Odoo19Company {
  id: number
  name: string
}

export interface Odoo19Warehouse {
  id: number
  name: string
  company_id: [number, string] | false
}

export interface Odoo19Partner {
  id: number
  name: string
  vat: string | false
}

export interface Odoo19Product {
  id: number
  default_code: string | false
  name: string
  rent_ok: boolean
}
