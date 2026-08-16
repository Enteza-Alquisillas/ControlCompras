process.loadEnvFile('.env.local')
import { generateText, stepCountIs } from 'ai'
import { openai } from '../src/lib/ai/openrouter.ts'
import { chatTools } from '../src/features/chat/tools/index.ts'
import { getOdooMcpTools } from '../src/features/chat/mcp/odooMcpTools.ts'

const SYSTEM_PROMPT = `Eres el asistente de Enteza Reservas. Responde SIEMPRE en espanol.
La fecha de hoy es: ${new Date().toISOString().split('T')[0]}
Si te preguntan un TOTAL o CONTEO de reservas/eventos en un rango de fechas, usa getDemandForecast.
Si te preguntan que articulo(s) se reservan mas, el mas popular, o un ranking de articulos en un rango de fechas, usa getMostReservedArticles con ese rango. NO intentes sumarlo tu mismo llamando a getArticleReservations articulo por articulo.`

const { tools: odooTools, close: closeOdooMcp } = await getOdooMcpTools()

const result = await generateText({
  model: openai.chat(process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini'),
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: 'Cual es el articulo mas reservado en mayo de 2026?' }],
  tools: { ...chatTools, ...odooTools },
  stopWhen: stepCountIs(8),
})

console.log('--- Texto final ---')
console.log(result.text)
console.log('--- Pasos y tool calls ---')
result.steps.forEach((step, i) => {
  console.log(`Paso ${i + 1}:`, (step.toolCalls ?? []).map(c => `${c.toolName}(${JSON.stringify(c.input)})`).join(' | ') || '(sin tool calls)')
})

await closeOdooMcp()
