/**
 * Auditoría temporal: contactos de Odoo 19 con CIF/NIF (vat) duplicado.
 * Uso: node scripts/audit-odoo19-vat-duplicates.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env.local')
const OUT_JSON = resolve(process.cwd(), 'scripts', 'vat-duplicate-report.json')
const OUT_CSV = resolve(process.cwd(), 'scripts', 'vat-duplicate-report.csv')

function loadEnv(path) {
  const env = {}
  try {
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
  } catch (err) {
    console.error(`No se pudo leer ${path}:`, err.message)
    process.exit(1)
  }
  return env
}

const env = loadEnv(ENV_PATH)
const URL = (env.ODOO19_URL || '').replace(/\/$/, '')
const DB = env.ODOO19_DB
const API_KEY = env.ODOO19_API_KEY

if (!URL || !DB || !API_KEY) {
  console.error('Faltan ODOO19_URL, ODOO19_DB o ODOO19_API_KEY en .env.local')
  process.exit(1)
}

async function odooCall(model, method, params) {
  const res = await fetch(`${URL}/json/2/${model}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      'X-Odoo-Database': DB,
    },
    body: JSON.stringify(params),
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

function normalizeVat(v) {
  return v
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[-.]/g, '')
    .replace(/^ES/, '')
}

async function fetchAllPartners(domain, fields) {
  const out = []
  const limit = 1000
  let offset = 0
  while (true) {
    const batch = await odooCall('res.partner', 'search_read', {
      domain,
      fields,
      limit,
      offset,
    })
    if (!Array.isArray(batch) || batch.length === 0) break
    out.push(...batch)
    if (batch.length < limit) break
    offset += limit
  }
  return out
}

function csvRow(cells) {
  return cells
    .map((c) => {
      const s = String(c ?? '').replace(/"/g, '""')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
    })
    .join(',')
}

async function main() {
  console.log('Cargando todos los contactos de Odoo 19...')
  const all = await fetchAllPartners([], ['id', 'name', 'vat', 'parent_id', 'is_company', 'type', 'active', 'company_id'])
  console.log(`   Total contactos: ${all.length}`)

  const withVat = all.filter((p) => p.vat && String(p.vat).trim() !== '')
  const withoutVat = all.filter((p) => !p.vat || String(p.vat).trim() === '')
  console.log(`   Con CIF/NIF propio: ${withVat.length}`)
  console.log(`   Sin CIF/NIF propio: ${withoutVat.length}`)

  // Duplicados exactos en el campo vat
  const byExact = new Map()
  for (const p of withVat) {
    const list = byExact.get(p.vat) || []
    list.push(p)
    byExact.set(p.vat, list)
  }
  const duplicatesExact = Array.from(byExact.entries()).filter(([_, list]) => list.length > 1)

  // Duplicados normalizados
  const byNormalized = new Map()
  for (const p of withVat) {
    const nv = normalizeVat(p.vat)
    const list = byNormalized.get(nv) || []
    list.push(p)
    byNormalized.set(nv, list)
  }
  const duplicatesNormalized = Array.from(byNormalized.entries()).filter(([_, list]) => list.length > 1)

  // Contactos hijos sin VAT cuyo padre tiene VAT (potenciales duplicados al editar)
  const parentById = new Map(all.filter((p) => p.is_company || !p.parent_id).map((p) => [p.id, p]))
  // Para cada padre, también consideramos el contacto principal si no es empresa pero no tiene padre
  const childsInheritingVat = []
  for (const p of withoutVat) {
    if (!p.parent_id) continue
    const parent = parentById.get(p.parent_id[0])
    if (parent && parent.vat && String(parent.vat).trim() !== '') {
      childsInheritingVat.push({ child: p, parent })
    }
  }

  // Caso adicional: contactos hijos que SÍ tienen VAT igual al de su padre (duplicado real padre-hijo)
  const childWithSameVatAsParent = []
  for (const p of withVat) {
    if (!p.parent_id) continue
    const parent = parentById.get(p.parent_id[0])
    if (parent && normalizeVat(parent.vat) === normalizeVat(p.vat)) {
      childWithSameVatAsParent.push({ child: p, parent })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      contacts: all.length,
      withVat: withVat.length,
      withoutVat: withoutVat.length,
      duplicatedVatExact: duplicatesExact.length,
      duplicatedVatExactContacts: duplicatesExact.reduce((s, [, list]) => s + list.length, 0),
      duplicatedVatNormalized: duplicatesNormalized.length,
      duplicatedVatNormalizedContacts: duplicatesNormalized.reduce((s, [, list]) => s + list.length, 0),
      childsInheritingVat: childsInheritingVat.length,
      childsWithSameVatAsParent: childWithSameVatAsParent.length,
    },
    duplicatedVatExact: duplicatesExact.map(([vat, list]) => ({ vat, count: list.length, contacts: list })),
    duplicatedVatNormalized: duplicatesNormalized.map(([vat, list]) => ({ normalizedVat: vat, count: list.length, contacts: list })),
    childsInheritingVat: childsInheritingVat.map(({ child, parent }) => ({
      childId: child.id,
      childName: child.name,
      childType: child.type,
      parentId: parent.id,
      parentName: parent.name,
      parentVat: parent.vat,
    })),
    childsWithSameVatAsParent: childWithSameVatAsParent.map(({ child, parent }) => ({
      childId: child.id,
      childName: child.name,
      childType: child.type,
      parentId: parent.id,
      parentName: parent.name,
      vat: child.vat,
    })),
  }

  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  console.log(`\n   Reporte JSON guardado en: ${OUT_JSON}`)

  // CSV resumido con los contactos duplicados y los hijos que heredan VAT
  const csvLines = []
  csvLines.push(csvRow(['category', 'id', 'name', 'vat', 'normalized_vat', 'parent_id', 'parent_name', 'is_company', 'type', 'active']))
  for (const [vat, list] of duplicatesExact) {
    for (const p of list) {
      csvLines.push(csvRow(['duplicate_exact', p.id, p.name, p.vat, normalizeVat(p.vat), p.parent_id?.[0] ?? '', p.parent_id?.[1] ?? '', p.is_company, p.type, p.active]))
    }
  }
  for (const [vat, list] of duplicatesNormalized) {
    for (const p of list) {
      csvLines.push(csvRow(['duplicate_normalized', p.id, p.name, p.vat, normalizeVat(p.vat), p.parent_id?.[0] ?? '', p.parent_id?.[1] ?? '', p.is_company, p.type, p.active]))
    }
  }
  for (const { child, parent } of childsInheritingVat) {
    csvLines.push(csvRow(['child_inherits_vat', child.id, child.name, '', parent.vat, parent.id, parent.name, child.is_company, child.type, child.active]))
  }
  for (const { child, parent } of childWithSameVatAsParent) {
    csvLines.push(csvRow(['child_same_vat_as_parent', child.id, child.name, child.vat, normalizeVat(child.vat), parent.id, parent.name, child.is_company, child.type, child.active]))
  }
  writeFileSync(OUT_CSV, csvLines.join('\n'))
  console.log(`   Reporte CSV guardado en:  ${OUT_CSV}`)

  console.log('\n=== RESUMEN ===')
  console.log(`Contactos totales: ${report.totals.contacts}`)
  console.log(`  - Con CIF/NIF propio: ${report.totals.withVat}`)
  console.log(`  - Sin CIF/NIF propio: ${report.totals.withoutVat}`)
  console.log(`CIF/NIF exactos duplicados (campo vat): ${report.totals.duplicatedVatExact}`)
  console.log(`  → contactos afectados: ${report.totals.duplicatedVatExactContacts}`)
  console.log(`CIF/NIF normalizados duplicados (espacios/guiones/ES): ${report.totals.duplicatedVatNormalized}`)
  console.log(`  → contactos afectados: ${report.totals.duplicatedVatNormalizedContacts}`)
  console.log(`Contactos hijos sin VAT propio pero con padre que tiene VAT: ${report.totals.childsInheritingVat}`)
  console.log(`Contactos hijos con VAT igual al de su padre: ${report.totals.childsWithSameVatAsParent}`)

  if (duplicatesExact.length > 0) {
    console.log('\n=== CIF/NIF duplicados (exactos) ===')
    for (const [vat, list] of duplicatesExact.sort((a, b) => b[1].length - a[1].length).slice(0, 30)) {
      console.log(`  ${vat}: ${list.length} contactos`)
      for (const p of list.slice(0, 5)) {
        console.log(`    #${p.id} ${p.name} | parent=${p.parent_id ? p.parent_id[1] : '-'} | company=${p.company_id ? p.company_id[1] : '-'} | type=${p.type}`)
      }
      if (list.length > 5) console.log(`    ... y ${list.length - 5} más`)
    }
  }

  if (childsInheritingVat.length > 0) {
    console.log('\n=== Muestra de contactos hijos que heredarían VAT del padre ===')
    for (const { child, parent } of childsInheritingVat.slice(0, 20)) {
      console.log(`  #${child.id} ${child.name} [${child.type || 'contact'}] → padre #${parent.id} ${parent.name} | VAT=${parent.vat}`)
    }
    if (childsInheritingVat.length > 20) console.log(`  ... y ${childsInheritingVat.length - 20} más`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
