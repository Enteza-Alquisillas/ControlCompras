export type OdooExportStatus =
  | 'pending'
  | 'exported'
  | 'selected'
  | 'exporting'
  | 'success'
  | 'error'

export interface RentalForExport {
  id: string
  legacy_id: number | null
  event_date: string
  delivery_date: string
  pickup_date: string
  delivery_address: string | null
  notes: string | null
  status: string | null
  odoo_order_id: number | null
  odoo_synced_at: string | null
  warehouse: { id: string; code: string } | null
  customer: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
  items: {
    id: string
    quantity: number
    article: {
      id: string
      code: string | null
      description: string
    } | null
  }[]
  itemCount: number
}

export interface OdooExportPayload {
  rentalIds: string[]
}

export interface OdooExportResult {
  rentalId: string
  rentalLegacyId: number | null
  customerName: string
  success: boolean
  odooOrderId?: number
  error?: string
}

export interface OdooExportBatchResult {
  total: number
  successful: number
  failed: number
  results: OdooExportResult[]
}

export interface OdooRpcResponse<T = unknown> {
  jsonrpc: string
  id: number
  result?: T
  error?: {
    code: number
    message: string
    data: {
      name: string
      debug: string
      message: string
    }
  }
}

export interface OdooSession {
  uid: number
  sessionId: string
}

export interface OdooProduct {
  id: number
  name: string
  default_code: string
  uom_id: [number, string]
  // Rental service (day) linked to this physical product
  product_rental_day_id: [number, string] | false
}

export interface OdooProductMatch {
  // Rental service product id (used as product_id on order line)
  id: number
  uomId: number
  // Physical product id (used as display_product_id on order line — Odoo's rental UI relies on this)
  physicalProductId: number
}

export interface OdooPartner {
  id: number
  name: string
  email: string | false
}

export interface OdooSaleOrderLine {
  product_id?: number
  product_uom_qty: number
  name: string
  price_unit: number
}
