process.loadEnvFile('.env.local')
import { generateText, stepCountIs } from 'ai'
import { openai } from '../src/lib/ai/openrouter.ts'
import { getOdooMcpTools } from '../src/features/chat/mcp/odooMcpTools.ts'

const { tools: odooTools, close: closeOdooMcp } = await getOdooMcpTools()
console.log('material_pedido_alquiler disponible:', 'material_pedido_alquiler' in odooTools)

const result = await generateText({
  model: openai.chat(process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini'),
  system: 'Eres el asistente de consulta a Odoo 19. Responde SIEMPRE en espanol. Si una Custom Tool cubre la pregunta, usala en vez de componer la consulta tu mismo.',
  messages: [{ role: 'user', content: 'Que material tiene el pedido de alquiler S00048?' }],
  tools: odooTools,
  stopWhen: stepCountIs(8),
})

console.log('--- Texto final ---')
console.log(result.text)
console.log('--- Tool calls ---')
result.steps.forEach((step, i) => {
  console.log(`Paso ${i + 1}:`, (step.toolCalls ?? []).map(c => `${c.toolName}(${JSON.stringify(c.input)})`).join(' | ') || '(sin tool calls)')
})

await closeOdooMcp()
