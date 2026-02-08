import { CustomerLegacy, TransformedCustomer } from '../types/index.js'

// Internal customers to exclude (Sevilla-Jerez, Jerez-Sevilla, etc.)
const EXCLUDED_CUSTOMERS = [410000, 110000]

/**
 * Transform legacy customers to Supabase format
 */
export function transformCustomers(legacyData: CustomerLegacy[]): TransformedCustomer[] {
  return legacyData.map((item) => ({
    legacy_id: item.ID_CLIENTE,
    name: item.NOMBRE_CLIENTE,
    phone: item.TEL1,
    email: item.EMAIL,
  }))
}

/**
 * Filter out internal/test customers
 */
export function filterExcludedCustomers(legacyData: CustomerLegacy[]): {
  filtered: CustomerLegacy[]
  excludedCount: number
} {
  const filtered = legacyData.filter((c) => !EXCLUDED_CUSTOMERS.includes(c.ID_CLIENTE))
  return {
    filtered,
    excludedCount: legacyData.length - filtered.length,
  }
}

/**
 * Check if a customer ID is excluded
 */
export function isExcludedCustomer(customerId: number): boolean {
  return EXCLUDED_CUSTOMERS.includes(customerId)
}
