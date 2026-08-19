/**
 * Crea en Odoo 19 los 6 productos "SOBRE VENTA..." (4502-4507) que se excluyeron
 * a propósito de la carga inicial de inventario (PRP-ODOO-004) porque su stock
 * legacy era un valor centinela (EXISTENCIA=9999), no una cantidad real.
 *
 * Se crean como producto de SERVICIO (type='service', rent_ok=false): son un
 * cargo que se vende, no un artículo que se alquila y devuelve.
 *
 * Uso: node scripts/create-sobre-venta-service-products.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env.local')
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
    env[key] = value
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
      detail = JSON.parse(text).message || text
    } catch {}
    throw new Error(`Odoo ${model}.${method} -> HTTP ${res.status}: ${detail.slice(0, 800)}`)
  }
  return text ? JSON.parse(text) : null
}

const PRODUCTS = [
  { code: '4502', name: 'SOBRE VENTA FAMILIA CRISTAL' },
  { code: '4503', name: 'SOBRE VENTA FAMILIA VAJILLA' },
  { code: '4504', name: 'SOBRE VENTA CUBERTERIA' },
  { code: '4505', name: 'SOBRE VENTA BOL Y CHUPITO' },
  { code: '4506', name: 'SOBRE VENTA MENAJE' },
  { code: '4507', name: 'SOBRE VENTA MESAS' },
]

async function resolveUnitsUomId() {
  const uoms = await odooCall('uom.uom', 'search_read', {
    domain: [['name', '=', 'Units']],
    fields: ['id', 'name'],
    limit: 1,
  })
  if (uoms.length === 0) throw new Error('No se encontró la unidad de medida "Units" en Odoo 19')
  return uoms[0].id
}

async function main() {
  const uomId = await resolveUnitsUomId()
  console.log(`UoM "Units" -> id ${uomId}`)

  const existing = await odooCall('product.product', 'search_read', {
    domain: [['default_code', 'in', PRODUCTS.map((p) => p.code)]],
    fields: ['id', 'default_code', 'name'],
  })
  const existingCodes = new Set(existing.map((p) => p.default_code))
  if (existing.length > 0) {
    console.log(`Ya existen ${existing.length} de estos códigos, se omiten:`, existing.map((p) => `${p.default_code}(#${p.id})`).join(', '))
  }

  for (const product of PRODUCTS) {
    if (existingCodes.has(product.code)) continue
    const id = await odooCall('product.product', 'create', {
      vals_list: [{
        name: product.name,
        default_code: product.code,
        type: 'service',
        rent_ok: false,
        sale_ok: true,
        uom_id: uomId,
        company_id: false,
      }],
      context: {},
    })
    console.log(`Creado ${product.code} "${product.name}" -> id ${id[0]}`)
  }

  console.log('\nListo.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
