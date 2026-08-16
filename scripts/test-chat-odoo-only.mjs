process.loadEnvFile('.env.local')
import { generateText, stepCountIs } from 'ai'
import { openai } from '../src/lib/ai/openrouter.ts'
import { getOdooMcpTools } from '../src/features/chat/mcp/odooMcpTools.ts'

const { tools: odooTools, close: closeOdooMcp } = await getOdooMcpTools()
console.log('Tools disponibles:', Object.keys(odooTools))

const result = await generateText({
  model: openai.chat(process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini'),
  system: 'Eres el asistente de consulta a Odoo 19. Responde SIEMPRE en espanol. Usa las herramientas odoo_* disponibles.',
  messages: [{ role: 'user', content: 'Busca en Odoo el cliente que contenga "SCANIA" en el nombre.' }],
  tools: odooTools,
  stopWhen: stepCountIs(8),
})

console.log('--- Texto final ---')
console.log(result.text)
await closeOdooMcp()
