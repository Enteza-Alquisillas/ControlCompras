process.loadEnvFile('.env.local')
import { generateText, stepCountIs } from 'ai'
import { openai } from '../src/lib/ai/openrouter.ts'
import { chatTools } from '../src/features/chat/tools/index.ts'
import { getOdooMcpTools } from '../src/features/chat/mcp/odooMcpTools.ts'

const SYSTEM_PROMPT = `Eres el asistente de Enteza Reservas, una empresa de alquiler de material para eventos (sillas, mesas, vajilla, cristaleria, etc.) con almacenes en Sevilla y Jerez.
La fecha de hoy es: ${new Date().toISOString().split('T')[0]}
Ademas de Supabase, tienes acceso de solo lectura a Odoo 19 (el ERP) con herramientas cuyo nombre empieza por "odoo_".
searchArticles, searchCustomers y el resto de herramientas sin prefijo "odoo_" consultan la base de datos propia de Enteza Reservas, NO el ERP. Si el usuario menciona explicitamente "Odoo" o "el ERP", usa las herramientas "odoo_*".
En Odoo NO existe un modelo "rental.order" ni "rental.order.line". Los pedidos de alquiler son "sale.order" con is_rental_order=true. El detalle de articulos esta en "sale.order.line", filtrando por "order_id" numerico. Los productos de las lineas son "product.product".`

const { tools: odooTools, close: closeOdooMcp } = await getOdooMcpTools()

const result = await generateText({
  model: openai.chat(process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini'),
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: 'Cuantas reservas tenemos del mes de mayo?' }],
  tools: { ...chatTools, ...odooTools },
  stopWhen: stepCountIs(8),
})

console.log('--- Texto final ---')
console.log(result.text)
console.log('--- Pasos y tool calls ---')
result.steps.forEach((step, i) => {
  console.log(`Paso ${i + 1}:`, (step.toolCalls ?? []).map(c => `${c.toolName}(${JSON.stringify(c.input)})`).join(' | ') || '(sin tool calls)')
})
console.log('Total de pasos:', result.steps.length)

await closeOdooMcp()
