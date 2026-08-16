import type { ToolSet } from 'ai'
import { createOdooMcpClient } from './odooMcpClient'
import { ODOO_MCP_DENYLIST } from './types'

interface OdooMcpToolsResult {
  tools: ToolSet
  close: () => Promise<void>
}

const NOOP_CLOSE = async () => {}

// Techo de filas que se deja pasar al modelo en un solo resultado de tool.
// mn_mcp_server no acota esto por si mismo: `odoo_search_read`/`odoo_search`
// aceptan `limit` pero Odoo no le pone techo si el modelo pide de mas (o lo
// omite), y `odoo_read_group` ni siquiera tiene parametro `limit` en su
// firma. Probado en vivo: un `odoo_read_group` sin domain sobre
// sale.order.line devolvio ~123.000 caracteres (~30.000 tokens) en una sola
// llamada; un `odoo_search_read` de solo 5 filas sin "fields" (Odoo devuelve
// entonces TODOS los campos del modelo) ya son ~20.000 caracteres. Este techo
// se aplica en dos sitios: antes de la llamada (clampToolInput, recortando
// `limit`/`ids` que pida el modelo) y despues (trimLargeResultText, por si se
// cuela igual un resultado grande, como en read_group que no tiene `limit`).
const MAX_RESULT_ROWS = 20

// Backstop final en caracteres: aunque las filas ya esten acotadas a
// MAX_RESULT_ROWS, un modelo Odoo con muchas columnas (sale.order.line trae
// decenas de campos si no se especifica "fields") puede seguir siendo enorme.
// ~6000 caracteres son ~1500 tokens, suficiente para mostrar datos utiles sin
// disparar el coste por columnas anchas que no se pueden acotar de forma
// generica (no sabemos que "fields" son relevantes para cada pregunta).
const MAX_RESULT_CHARS = 6000

// Tools cuyo parametro de "cuantas filas quiero" se llama `limit`.
const LIMIT_ARG_TOOLS = new Set(['odoo_search_read', 'odoo_search', 'odoo_name_search'])

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

// Recorta/ordena el texto de un resultado de tool si es demasiado grande.
// Dos formas conocidas de "demasiadas filas", mas un backstop final:
// 1. Custom Tool de tipo "group" (Aggregate/count by): {groups, groupby,
//    aggregates}. mn_mcp_server no soporta orden/limite para ese tipo (el
//    campo "Limit" del formulario no tiene efecto en su codigo para
//    kind="group"), asi que se ordena aqui por el primer valor agregado,
//    descendente, antes de recortar.
// 2. Cualquier otro resultado en forma de array (filas de odoo_search_read,
//    odoo_search, o las filas planas que devuelve odoo_read_group, que no
//    tiene "limit" en su firma): se recorta a MAX_RESULT_ROWS sin reordenar
//    (no hay forma generica de saber por que campo ordenar) y se avisa al
//    modelo para que acote mas la consulta.
// 3. Backstop: si el texto sigue siendo enorme tras lo anterior (columnas
//    anchas de un modelo sin "fields" especificado), se trunca en caracteres.
function trimLargeResultText(text: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }

  let output = text

  if (isGroupToolResult(parsed)) {
    const aggregateIndex = parsed.groupby.length
    const totalGroups = parsed.groups.length
    const sorted = [...parsed.groups].sort(
      (a, b) => (Number(b[aggregateIndex]) || 0) - (Number(a[aggregateIndex]) || 0),
    )

    output = JSON.stringify({
      ...parsed,
      groups: sorted.slice(0, MAX_RESULT_ROWS),
      totalGroups,
      note:
        totalGroups > MAX_RESULT_ROWS
          ? `Se muestran los ${MAX_RESULT_ROWS} grupos con mayor valor agregado, de ${totalGroups} totales, ya ordenados de mayor a menor.`
          : 'Grupos ya ordenados de mayor a menor por el valor agregado.',
    })
  } else if (Array.isArray(parsed) && parsed.length > MAX_RESULT_ROWS) {
    output = JSON.stringify({
      rows: parsed.slice(0, MAX_RESULT_ROWS),
      totalRows: parsed.length,
      truncated: true,
      note: `Se muestran solo los primeros ${MAX_RESULT_ROWS} de ${parsed.length} registros para no gastar tokens de mas. Anade condiciones al domain (fechas, estado, etc.), agrupa por algo mas especifico, o pide menos "fields" para ver el resto sin truncar.`,
    })
  }

  if (output.length > MAX_RESULT_CHARS) {
    output = `${output.slice(0, MAX_RESULT_CHARS)}\n...[TRUNCADO: resultado de ${output.length} caracteres recortado a ${MAX_RESULT_CHARS}. Vuelve a llamar a la tool pidiendo menos "fields" o acotando mas el domain/groupby.]`
  }

  return output
}

// Recorta antes de llamar: si el modelo pide `limit` (o `ids`, para
// odoo_read) por encima del techo, o no lo pide, se fuerza MAX_RESULT_ROWS.
// Evita gastar la llamada a Odoo en filas que luego se recortarian igual.
function clampToolInput(name: string, input: unknown): unknown {
  if (!input || typeof input !== 'object') return input
  const args = input as Record<string, unknown>

  if (LIMIT_ARG_TOOLS.has(name)) {
    const requested = typeof args.limit === 'number' ? args.limit : undefined
    return {
      ...args,
      limit: requested && requested > 0 ? Math.min(requested, MAX_RESULT_ROWS) : MAX_RESULT_ROWS,
    }
  }

  if (name === 'odoo_read' && Array.isArray(args.ids) && args.ids.length > MAX_RESULT_ROWS) {
    return { ...args, ids: args.ids.slice(0, MAX_RESULT_ROWS) }
  }

  return args
}

// Envuelve el execute de una tool MCP para (1) acotar limit/ids antes de
// llamar a Odoo y (2) recortar/ordenar el texto del resultado si igual se
// colo demasiado (p.ej. odoo_read_group, que no admite `limit`). Tipado laxo
// a proposito (unknown + checks en runtime) porque `@ai-sdk/mcp` y `ai`
// traen versiones ligeramente distintas del tipo Tool y el cast final
// `as ToolSet` ya asume esa compatibilidad estructural.
function withResultGuardrails(name: string, tool: unknown): unknown {
  if (!tool || typeof tool !== 'object' || !('execute' in tool)) return tool
  const originalExecute = (tool as { execute?: unknown }).execute
  if (typeof originalExecute !== 'function') return tool

  const wrappedExecute = async (input: unknown, ...rest: unknown[]) => {
    const clampedInput = clampToolInput(name, input)
    const result = await (originalExecute as (...a: unknown[]) => unknown)(clampedInput, ...rest)
    if (!result || typeof result !== 'object' || !('content' in result)) return result

    const content = (result as { content?: unknown }).content
    if (!Array.isArray(content)) return result

    const trimmedContent = content.map((part) => {
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
        const textPart = part as { type: 'text'; text: string }
        return { ...textPart, text: trimLargeResultText(textPart.text) }
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
        .map(([name, tool]) => [name, withResultGuardrails(name, tool)]),
    ) as ToolSet

    return { tools: allowedTools, close: () => client.close() }
  } catch (error) {
    console.error('[odooMcpTools] No se pudieron listar las herramientas de Odoo:', error)
    await client.close()
    return { tools: {}, close: NOOP_CLOSE }
  }
}
