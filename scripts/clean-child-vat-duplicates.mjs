/**
 * Limpieza: vacía el CIF/NIF (vat) de los contactos hijos que tienen el mismo
 * valor que su empresa padre. No modifica contactos sin padre ni empresas.
 *
 * Uso:
 *   node scripts/clean-child-vat-duplicates.mjs          # preview
 *   node scripts/clean-child-vat-duplicates.mjs --apply  # ejecuta cambios
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env.local')
const OUT_PLAN = resolve(process.cwd(), 'scripts', 'clean-child-vat-plan.json')

function loadEnv(path) {
  const env = {}
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
    env[key] = value
  }
  return env
}

const APPLY = process.argv.includes('--apply')

const env = loadEnv(ENV_PATH)
const URL = (env.ODOO19_URL || '').replace(/\/$/, '')
const DB = env.ODOO19_DB
const API_KEY = env.ODOO19_API_KEY

if (!URL || !DB || !API_KEY) {
  console.error('Faltan ODOO19_URL, ODOO19_DB o ODOO19_API_KEY en .env.local')
  process.exit(1)
}

const CONTEXT = {
  tracking_disable: true,
  mail_notrack: true,
  mail_create_nolog: true,
}

async function odooCall(model, method, params) {
  const res = await fetch(`${URL}/json/2/${model}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      'X-Odoo-Database': DB,
    },
    body: JSON.stringify({ ...params, context: CONTEXT }),
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text
    try {
      const parsed = JSON.parse(text)
      detail = parsed.message || text
    } catch {}
    throw new Error(`Odoo ${model}.${method} → HTTP ${res.status}: ${detail.slice(0, 500)}`)
  }
  return text ? JSON.parse(text) : null
}

async function fetchAllPartners(domain, fields) {
  const out = []
  const limit = 1000
  let offset = 0
  while (true) {
    const batch = await odooCall('res.partner', 'search_read', { domain, fields, limit, offset })
    if (!Array.isArray(batch) || batch.length === 0) break
    out.push(...batch)
    if (batch.length < limit) break
    offset += limit
  }
  return out
}

function normalizeVat(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[-.]/g, '')
    .replace(/^ES/, '')
}

async function main() {
  console.log(APPLY ? 'MODO EJECUCIÓN' : 'MODO PREVIEW')
  console.log('Cargando contactos...')
  const all = await fetchAllPartners([], ['id', 'name', 'vat', 'parent_id', 'is_company', 'type', 'active'])
  const byId = new Map(all.map((p) => [p.id, p]))

  // Hijos con VAT igual al del padre
  const toClean = []
  for (const p of all) {
    if (!p.parent_id) continue
    if (!p.vat || String(p.vat).trim() === '') continue
    const parent = byId.get(p.parent_id[0])
    if (!parent) continue
    if (normalizeVat(p.vat) === normalizeVat(parent.vat)) {
      toClean.push({
        id: p.id,
        name: p.name,
        type: p.type,
        vat: p.vat,
        parentId: parent.id,
        parentName: parent.name,
        parentVat: parent.vat,
      })
    }
  }

  console.log(`\nContactos hijos con CIF igual al de su padre: ${toClean.length}`)
  for (const c of toClean.slice(0, 20)) {
    console.log(`  #${c.id} ${c.name} | VAT=${c.vat} | padre #${c.parentId} ${c.parentName}`)
  }
  if (toClean.length > 20) console.log(`  ... y ${toClean.length - 20} más`)

  writeFileSync(OUT_PLAN, JSON.stringify(toClean, null, 2))
  console.log(`\nPlan guardado en: ${OUT_PLAN}`)

  if (!APPLY) {
    console.log('\nNo se ha modificado nada.')
    console.log('Para aplicar la limpieza ejecuta:')
    console.log('  node scripts/clean-child-vat-duplicates.mjs --apply')
    return
  }

  if (toClean.length === 0) {
    console.log('No hay contactos que limpiar.')
    return
  }

  const ids = toClean.map((c) => c.id)
  console.log(`\nVaciando CIF en ${ids.length} contactos...`)
  await odooCall('res.partner', 'write', { ids, vals: { vat: false } })
  console.log('Write completado. Verificando...')

  // Verificación: leer de nuevo los contactos limpiados
  const cleaned = await fetchAllPartners([['id', 'in', ids]], ['id', 'name', 'vat'])
  const stillWithVat = cleaned.filter((p) => p.vat && String(p.vat).trim() !== '')
  console.log(`Verificados: ${cleaned.length}`)
  if (stillWithVat.length > 0) {
    console.warn(`⚠️ ${stillWithVat.length} contactos aún conservan CIF:`)
    for (const p of stillWithVat) console.warn(`  #${p.id} ${p.name} | VAT=${p.vat}`)
  } else {
    console.log('✅ Todos los contactos seleccionados ahora tienen el CIF vacío.')
  }

  // Re-auditoría rápida
  console.log('\nRe-auditando duplicados...')
  const allAfter = await fetchAllPartners([], ['id', 'name', 'vat', 'parent_id', 'is_company', 'type'])
  const withVat = allAfter.filter((p) => p.vat && String(p.vat).trim() !== '')
  const byVat = new Map()
  for (const p of withVat) {
    const list = byVat.get(p.vat) || []
    list.push(p)
    byVat.set(p.vat, list)
  }
  const duplicatesAfter = Array.from(byVat.entries()).filter(([_, list]) => list.length > 1)
  const affectedAfter = duplicatesAfter.reduce((s, [, list]) => s + list.length, 0)
  console.log(`CIF/NIF duplicados restantes: ${duplicatesAfter.length} (contactos afectados: ${affectedAfter})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
