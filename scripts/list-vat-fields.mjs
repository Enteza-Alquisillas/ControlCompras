/**
 * Lista campos de res.partner relacionados con CIF/NIF/VAT en Odoo 19.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv(path) {
  const env = {}
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    let value = trimmed.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
    env[trimmed.slice(0, eq).trim()] = value
  }
  return env
}

const env = loadEnv(resolve(process.cwd(), '.env.local'))
const URL = env.ODOO19_URL.replace(/\/$/, '')

async function main() {
  const res = await fetch(`${URL}/json/2/res.partner/fields_get`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.ODOO19_API_KEY}`,
      'X-Odoo-Database': env.ODOO19_DB,
    },
    body: JSON.stringify({ allfields: [], attributes: ['string', 'type', 'store', 'required'] }),
  })
  const data = await res.json()
  const fields = Object.entries(data)
    .filter(([k, v]) => /vat|nif|cif|identif|tax/i.test(k) || /VAT|NIF|CIF|Identif|Tax/i.test(v.string || ''))
    .map(([k, v]) => ({ name: k, string: v.string, type: v.type, store: v.store, required: v.required }))
  console.log(JSON.stringify(fields, null, 2))
}

main().catch(console.error)
