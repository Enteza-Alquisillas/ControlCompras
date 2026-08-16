import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const env = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  let v = t.slice(eq + 1).trim()
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  env[t.slice(0, eq).trim()] = v
}
const url = env.ODOO19_URL.replace(/\/$/, '')

async function call(model, method, params) {
  const r = await fetch(`${url}/json/2/${model}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ODOO19_API_KEY}`, 'X-Odoo-Database': env.ODOO19_DB },
    body: JSON.stringify(params),
  })
  return r.json()
}

const total = await call('res.partner', 'search_count', { domain: [] })
const withVat = await call('res.partner', 'search_count', { domain: [['vat', '!=', false], ['vat', '!=', '']] })
const withoutVat = await call('res.partner', 'search_count', { domain: [['vat', 'in', [false, '']]] })
console.log({ total, withVat, withoutVat })
