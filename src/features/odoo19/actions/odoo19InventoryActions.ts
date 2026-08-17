'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createOdoo19Client } from '../services/odoo19Client'
import { applyInventoryLoad, buildInventoryPreview } from '../services/odoo19InventoryService'
import type { Odoo19InventoryApplyResult, Odoo19InventoryPreview } from '../types'

async function requireUser(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
}

/**
 * Recalcula el inventario en vivo (SQL Server + Odoo 19) en cada llamada.
 * No lee de Supabase: el espejo puede estar desactualizado (ver PRP-ODOO-004).
 */
export async function previewOdoo19InventoryLoad(): Promise<Odoo19InventoryPreview> {
  await requireUser()
  const client = createOdoo19Client()
  return buildInventoryPreview(client)
}

const applyPayloadSchema = z.object({
  codes: z.array(z.string()).optional(),
})

/**
 * Aplica la carga de inventario. Recalcula el preview en el servidor en el
 * momento de aplicar (no confía en el snapshot que vio el navegador) para
 * garantizar que Odoo queda exactamente igual al SQL Server en ese instante.
 * `codes` permite reaplicar solo un subconjunto (p.ej. reintentar fallidos).
 */
export async function applyOdoo19InventoryLoad(input: unknown): Promise<Odoo19InventoryApplyResult> {
  const { codes } = applyPayloadSchema.parse(input ?? {})
  await requireUser()

  const client = createOdoo19Client()
  const preview = await buildInventoryPreview(client)
  const items = codes ? preview.items.filter((item) => codes.includes(item.code)) : preview.items
  return applyInventoryLoad(client, { ...preview, items })
}
