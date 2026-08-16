process.loadEnvFile('.env.local')
import { generateText, stepCountIs } from 'ai'
import { openai } from '../src/lib/ai/openrouter.ts'
import { chatTools } from '../src/features/chat/tools/index.ts'
import { getOdooMcpTools } from '../src/features/chat/mcp/odooMcpTools.ts'

const SYSTEM_PROMPT = `Eres el asistente de Enteza Reservas. Responde SIEMPRE en espanol.
Ademas de Supabase, tienes acceso de solo lectura a Odoo 19 (el ERP) con herramientas cuyo nombre empieza por "odoo_" (odoo_search, odoo_search_read, odoo_read, odoo_name_search, etc.).
searchArticles, searchCustomers y el resto de herramientas sin prefijo "odoo_" consultan la base de datos propia de Enteza Reservas, NO el ERP. Si el usuario menciona explicitamente "Odoo" o "el ERP", usa las herramientas "odoo_*".`

const { tools: odooTools, close: closeOdooMcp } = await getOdooMcpTools()
console.log('Odoo tools disponibles:', Object.keys(odooTools))

const result = await generateText({
  model: openai.chat(process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini'),
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: 'Busca en Odoo el cliente que contenga "SCANIA" en el nombre y dime su ID.' }],
  tools: { ...chatTools, ...odooTools },
  stopWhen: stepCountIs(8),
})

console.log('--- Texto final ---')
console.log(result.text)
console.log('--- Tool calls ejecutadas ---')
for (const step of result.steps) {
  for (const call of step.toolCalls ?? []) {
    console.log(call.toolName, JSON.stringify(call.input))
  }
}

await closeOdooMcp()
