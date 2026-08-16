process.loadEnvFile('.env.local')
import { generateText, stepCountIs } from 'ai'
import { openai } from '../src/lib/ai/openrouter.ts'
import { getOdooMcpTools } from '../src/features/chat/mcp/odooMcpTools.ts'

const { tools: odooTools, close: closeOdooMcp } = await getOdooMcpTools()

const start = Date.now()
const result = await generateText({
  model: openai.chat(process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini'),
  system: 'Eres el asistente de consulta a Odoo 19. Responde SIEMPRE en espanol. Si una Custom Tool cubre la pregunta, usala.',
  messages: [{ role: 'user', content: 'Cual es el articulo mas alquilado en mayo de 2026 segun Odoo?' }],
  tools: odooTools,
  stopWhen: stepCountIs(8),
})

console.log('--- Texto final ---')
console.log(result.text)
console.log('--- Tokens usados (total):', result.usage?.totalTokens, '| tiempo:', Date.now()-start, 'ms ---')
await closeOdooMcp()
