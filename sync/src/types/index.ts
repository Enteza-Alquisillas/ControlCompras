// Legacy SQL Server types
export interface ArticleLegacy {
  ID_MATERIAL: number
  DESCRIPCION: string
  CLASIFICACION: string | null
  EXISTENCIA: number
  ID_MATERIAL_SEVILLA?: number | null
  ID_MATERIAL_JEREZ?: number | null
}

export interface CustomerLegacy {
  ID_CLIENTE: number
  NOMBRE_CLIENTE: string
  TEL1: string | null
  EMAIL: string | null
}

export interface RentalLegacy {
  ID_EVENTO: number
  ID_CLIENTE: number
  FECHA_EVENTO: string
  FECHA_ENTREGA: string
  FECHA_RECOLECTA: string
  STATUS: string | null
  NOTAS: string | null
  LUGAR_DESCRIPCION: string | null
  // Fields from Detail table
  ID_MATERIAL: number
  CANTIDAD: number
  NOTAS_ITEM: string | null
}

// Sync result types
export interface SyncResult {
  success: boolean
  entity: string
  count: number
  skipped?: number
  cancelled?: number
  errors?: string[]
  duration?: number
}

export interface SyncSummary {
  startedAt: Date
  completedAt: Date
  warehouse?: string
  results: SyncResult[]
  totalSuccess: boolean
  criticalErrors: string[]
}

// Transformed types for Supabase
export interface TransformedArticle {
  legacy_id: number
  code: string
  description: string
  family: string | null
  is_active: boolean
  legacy_id_sevilla: number | null
  legacy_id_jerez: number | null
}

export interface TransformedStock {
  legacy_id: number
  warehouse_id: string
  quantity: number
}

export interface TransformedCustomer {
  legacy_id: number
  name: string
  phone: string | null
  email: string | null
}

export interface TransformedRental {
  legacy_id: number
  customer_id: string
  warehouse_id: string
  delivery_address: string | null
  event_date: string
  delivery_date: string
  pickup_date: string
  status: string
  notes: string | null
}

export interface TransformedRentalItem {
  rental_id: string
  article_id: string
  quantity: number
  notes: string | null
}
