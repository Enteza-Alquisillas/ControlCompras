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
    RFC: string | null
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

export interface ImportResult {
    success: boolean
    count: number
    table: string
    error?: string
    skippedCount?: number
    totalFound?: number
}
