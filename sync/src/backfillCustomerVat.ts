#!/usr/bin/env node
import { Command } from 'commander'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadConfig, WAREHOUSES, type Warehouse } from './config.js'
import { SqlServerService } from './services/sqlServerService.js'

interface SupabaseCustomerWithoutVat {
  id: string
  legacy_id: number
  name: string
  vat: null
}

interface SourceCustomer {
  warehouse: Warehouse
  legacyId: number
  name: string
  normalizedName: string
  vat: string
}

interface CandidateUpdate {
  id: string
  legacyId: number
  vat: string
}

function normalizeVat(value: string | null): string | null {
  if (!value) return null
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.startsWith('ES') ? normalized.slice(2) || null : normalized || null
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

async function getCustomersWithoutVat(
  supabase: SupabaseClient<any>
): Promise<SupabaseCustomerWithoutVat[]> {
  const customers: SupabaseCustomerWithoutVat[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, legacy_id, name, vat')
      .is('vat', null)
      .order('legacy_id')
      .range(offset, offset + 999)

    if (error) throw new Error(`No se pudieron leer los clientes de Supabase: ${error.message}`)
    if (!data || data.length === 0) break
    customers.push(...(data as SupabaseCustomerWithoutVat[]))
    if (data.length < 1000) break
    offset += 1000
  }

  return customers
}

function groupSourceCustomers(customers: SourceCustomer[]): Map<number, SourceCustomer[]> {
  const byLegacyId = new Map<number, SourceCustomer[]>()
  for (const customer of customers) {
    const matches = byLegacyId.get(customer.legacyId) ?? []
    matches.push(customer)
    byLegacyId.set(customer.legacyId, matches)
  }
  return byLegacyId
}

async function main(): Promise<void> {
  const program = new Command()
    .name('backfill-customer-vat')
    .description('Rellena NIF/CIF vacíos en Supabase a partir de dbo.CLIENTE de Sevilla y Jerez')
    .option('--apply', 'Escribe los cambios validados en Supabase')
  program.parse()

  const { apply } = program.opts<{ apply?: boolean }>()
  const config = loadConfig()
  const sqlServer = new SqlServerService(config.sqlServer)
  const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch all sources before calculating or applying any change.
  const sourceRows: SourceCustomer[] = []
  for (const warehouse of WAREHOUSES) {
    const customers = await sqlServer.getCustomers(warehouse)
    sourceRows.push(...customers.flatMap((customer): SourceCustomer[] => {
      const vat = normalizeVat(customer.RFC)
      const legacyId = Number(customer.ID_CLIENTE)
      if (!vat || !Number.isSafeInteger(legacyId)) return []
      return [{
        warehouse,
        legacyId,
        name: customer.NOMBRE_CLIENTE,
        normalizedName: normalizeName(customer.NOMBRE_CLIENTE),
        vat,
      }]
    }))
  }
  const sourceByLegacyId = groupSourceCustomers(sourceRows)
  const targets = await getCustomersWithoutVat(supabase)

  const updates: CandidateUpdate[] = []
  let noSourceVat = 0
  let nameMismatch = 0
  let conflictingVat = 0

  for (const target of targets) {
    const sourceMatches = sourceByLegacyId.get(target.legacy_id) ?? []
    if (sourceMatches.length === 0) {
      noSourceVat++
      continue
    }

    // An ID match alone is not enough across two independent source databases.
    const sameName = sourceMatches.filter((source) => source.normalizedName === normalizeName(target.name))
    if (sameName.length === 0) {
      nameMismatch++
      continue
    }

    const vats = new Set(sameName.map((source) => source.vat))
    if (vats.size !== 1) {
      conflictingVat++
      continue
    }

    updates.push({ id: target.id, legacyId: target.legacy_id, vat: vats.values().next().value! })
  }

  console.log('========== NIF/CIF BACKFILL ==========' )
  console.log(`Clientes sin NIF/CIF en Supabase: ${targets.length}`)
  console.log(`Actualizaciones validadas: ${updates.length}`)
  console.log(`Sin NIF/CIF en origen: ${noSourceVat}`)
  console.log(`ID encontrado pero nombre distinto: ${nameMismatch}`)
  console.log(`NIF/CIF distinto entre almacenes: ${conflictingVat}`)

  if (!apply) {
    console.log('\nModo simulación: no se ha modificado Supabase.')
    console.log('Ejecuta de nuevo con --apply solo después de revisar estas cifras.')
    return
  }

  let updated = 0
  for (const update of updates) {
    // The null condition protects values added by another process after the audit.
    const { data, error } = await supabase
      .from('customers')
      .update({ vat: update.vat })
      .eq('id', update.id)
      .eq('legacy_id', update.legacyId)
      .is('vat', null)
      .select('id')

    if (error) throw new Error(`No se pudo actualizar el cliente legacy ${update.legacyId}: ${error.message}`)
    if (data?.length === 1) updated++
  }

  console.log(`\nActualizaciones aplicadas: ${updated}`)
  console.log(`No aplicadas por cambio concurrente: ${updates.length - updated}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
