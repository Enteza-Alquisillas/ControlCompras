import { CustomerLegacy, TransformedCustomer } from '../types/index.js'

// Internal customers to exclude by ID (fallback)
const EXCLUDED_CUSTOMER_IDS = [410000, 110000]

// Internal customers to exclude by name pattern (primary filter)
// Matches any customer whose name contains these substrings (case-insensitive)
const EXCLUDED_CUSTOMER_PATTERNS = ['ENTEZA']

function normalizeVat(value: string | null): string | null {
  if (!value) return null
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.startsWith('ES') ? normalized.slice(2) || null : normalized || null
}

/**
 * Check if a customer name matches an excluded pattern
 */
function isExcludedByName(name: string): boolean {
  const upperName = name.toUpperCase()
  return EXCLUDED_CUSTOMER_PATTERNS.some((pattern) => upperName.includes(pattern.toUpperCase()))
}

/**
 * Transform legacy customers to Supabase format
 */
export function transformCustomers(legacyData: CustomerLegacy[]): TransformedCustomer[] {
  return legacyData.map((item) => ({
    legacy_id: item.ID_CLIENTE,
    name: item.NOMBRE_CLIENTE,
    phone: item.TEL1,
    email: item.EMAIL,
    vat: normalizeVat(item.RFC),
  }))
}

/**
 * Filter out internal/test customers by ID and name pattern
 */
export function filterExcludedCustomers(legacyData: CustomerLegacy[]): {
  filtered: CustomerLegacy[]
  excludedCount: number
} {
  const filtered = legacyData.filter(
    (c) => !EXCLUDED_CUSTOMER_IDS.includes(c.ID_CLIENTE) && !isExcludedByName(c.NOMBRE_CLIENTE)
  )
  return {
    filtered,
    excludedCount: legacyData.length - filtered.length,
  }
}

/**
 * Build a set of excluded customer IDs from raw customer data.
 * Uses both static ID list and name pattern matching.
 */
export function buildExcludedCustomerIds(legacyData: CustomerLegacy[]): Set<number> {
  const ids = new Set<number>()
  for (const c of legacyData) {
    if (EXCLUDED_CUSTOMER_IDS.includes(c.ID_CLIENTE) || isExcludedByName(c.NOMBRE_CLIENTE)) {
      ids.add(c.ID_CLIENTE)
    }
  }
  return ids
}

/**
 * Check if a customer ID is excluded (static list + dynamic set)
 */
export function isExcludedCustomer(customerId: number, dynamicExcluded?: Set<number>): boolean {
  if (dynamicExcluded?.has(customerId)) return true
  return EXCLUDED_CUSTOMER_IDS.includes(customerId)
}
