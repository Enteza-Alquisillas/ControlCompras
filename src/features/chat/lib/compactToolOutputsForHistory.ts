import type { UIMessage } from 'ai'

const MAX_ITEMS_IN_HISTORY = 5

function compactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const compacted = value.map(compactValue)
    if (compacted.length <= MAX_ITEMS_IN_HISTORY) return compacted
    return {
      truncatedForHistory: true,
      originalLength: compacted.length,
      sample: compacted.slice(0, MAX_ITEMS_IN_HISTORY),
    }
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, compactValue(val)]),
    )
  }
  return value
}

/**
 * useChat reenvia TODO el historial de mensajes en cada peticion a /api/chat.
 * Las tools de Odoo/Supabase (sobre todo queryTable, hasta 1000 filas con
 * embeds) pueden dejar resultados de varios cientos de KB en un solo mensaje;
 * acumulados a lo largo de la conversacion, superan el limite de payload de
 * las funciones de Vercel (FUNCTION_PAYLOAD_TOO_LARGE / Request Entity Too
 * Large). Antes de reenviar el historial, se recorta cada resultado de tool
 * ya respondido a una muestra: el modelo conserva los campos planos
 * (contadores, totales) y una muestra de las filas, no el volcado completo.
 */
export function compactToolOutputsForHistory(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.parts)) return message
    const parts = message.parts.map((part) => {
      const type = (part as { type?: string }).type
      const isToolPart = typeof type === 'string' && (type.startsWith('tool-') || type === 'dynamic-tool')
      const state = (part as { state?: string }).state
      const output = (part as { output?: unknown }).output
      if (!isToolPart || state !== 'output-available' || output === undefined) return part
      return { ...part, output: compactValue(output) } as typeof part
    })
    return { ...message, parts }
  })
}
