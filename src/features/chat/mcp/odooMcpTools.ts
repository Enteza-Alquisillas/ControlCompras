import type { ToolSet } from 'ai'
import { createOdooMcpClient } from './odooMcpClient'
import { ODOO_MCP_DENYLIST } from './types'

interface OdooMcpToolsResult {
  tools: ToolSet
  close: () => Promise<void>
}

const NOOP_CLOSE = async () => {}

// Cuantos grupos como maximo se dejan pasar al modelo para el resultado de una
// Custom Tool de tipo "group". mn_mcp_server no soporta orden/limite en ese
// tipo de tool (el campo "Limit" del formulario no tiene efecto en su codigo
// para kind="group"), asi que sin este recorte una pregunta de tipo "el mas
// alquilado" puede devolver cientos de filas sin ordenar y disparar el coste
// en tokens. Se ordena aqui por el primer valor agregado, descendente.
const MAX_GROUP_ROWS = 20

interface GroupToolResult {
  groups: unknown[][]
  groupby: unknown[]
  aggregates: unknown[]
  [key: string]: unknown
}

function isGroupToolResult(value: unknown): value is GroupToolResult {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.groups) && Array.isArray(candidate.groupby) && Array.isArray(candidate.aggregates)
}

function trimGroupResultText(text: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return text
  }

  if (!isGroupToolResult(parsed)) return text

  const aggregateIndex = parsed.groupby.length
  const totalGroups = parsed.groups.length
  const sorted = [...parsed.groups].sort(
    (a, b) => (Number(b[aggregateIndex]) || 0) - (Number(a[aggregateIndex]) || 0),
  )

  return JSON.stringify({
    ...parsed,
    groups: sorted.slice(0, MAX_GROUP_ROWS),
    totalGroups,
    note:
      totalGroups > MAX_GROUP_ROWS
        ? `Se muestran los ${MAX_GROUP_ROWS} grupos con mayor valor agregado, de ${totalGroups} totales, ya ordenados de mayor a menor.`
        : 'Grupos ya ordenados de mayor a menor por el valor agregado.',
  })
}

// Envuelve el execute de una tool MCP para recortar/ordenar el resultado si
// tiene forma de resultado "group" (Custom Tool de tipo Aggregate/count by).
// Cualquier otro resultado pasa sin tocar. Tipado laxo a proposito (unknown +
// checks en runtime) porque `@ai-sdk/mcp` y `ai` traen versiones ligeramente
// distintas del tipo Tool y el cast final `as ToolSet` ya asume esa
// compatibilidad estructural.
function withGroupResultTrimming(tool: unknown): unknown {
  if (!tool || typeof tool !== 'object' || !('execute' in tool)) return tool
  const originalExecute = (tool as { execute?: unknown }).execute
  if (typeof originalExecute !== 'function') return tool

  const wrappedExecute = async (...args: unknown[]) => {
    const result = await (originalExecute as (...a: unknown[]) => unknown)(...args)
    if (!result || typeof result !== 'object' || !('content' in result)) return result

    const content = (result as { content?: unknown }).content
    if (!Array.isArray(content)) return result

    const trimmedContent = content.map((part) => {
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
        const textPart = part as { type: 'text'; text: string }
        return { ...textPart, text: trimGroupResultText(textPart.text) }
      }
      return part
    })

    return { ...result, content: trimmedContent }
  }

  return { ...tool, execute: wrappedExecute }
}

// Descubre las tools que expone mn_mcp_server (tools/list) y descarta las
// peligrosas por nombre (ODOO_MCP_DENYLIST). Todo lo demas pasa, incluidas
// las Custom Tools que se definan en Odoo (Ajustes -> MCP Server -> Custom
// Tools) — no requieren cambios en este archivo para llegar al chat. El chat
// (src/app/api/chat/route.ts) es exclusivamente sobre datos de Odoo: si esto
// devuelve un ToolSet vacio (Odoo no configurado o no responde), el chat se
// queda sin ninguna tool disponible.
export async function getOdooMcpTools(): Promise<OdooMcpToolsResult> {
  const client = await createOdooMcpClient()

  if (!client) {
    return { tools: {}, close: NOOP_CLOSE }
  }

  try {
    const allTools = await client.tools()

    const allowedTools = Object.fromEntries(
      Object.entries(allTools)
        .filter(([name]) => !(ODOO_MCP_DENYLIST as readonly string[]).includes(name))
        .map(([name, tool]) => [name, withGroupResultTrimming(tool)]),
    ) as ToolSet

    return { tools: allowedTools, close: () => client.close() }
  } catch (error) {
    console.error('[odooMcpTools] No se pudieron listar las herramientas de Odoo:', error)
    await client.close()
    return { tools: {}, close: NOOP_CLOSE }
  }
}
