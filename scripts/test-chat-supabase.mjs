process.loadEnvFile('.env.local')
import { generateText, stepCountIs } from 'ai'
import { openai } from '../src/lib/ai/openrouter.ts'
import { chatTools } from '../src/features/chat/tools/index.ts'

const result = await generateText({
  model: openai.chat(process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini'),
  system: 'Eres el asistente de Enteza Reservas. Responde SIEMPRE en espanol. Usa las tools de Supabase disponibles.',
  messages: [{ role: 'user', content: 'Que roturas de stock hay entre el 2026-02-01 y el 2026-02-05?' }],
  tools: chatTools,
  stopWhen: stepCountIs(5),
})

console.log('--- Texto final ---')
console.log(result.text)
console.log('--- Tool calls ---')
for (const step of result.steps) {
  for (const call of step.toolCalls ?? []) {
    console.log(call.toolName, JSON.stringify(call.input))
  }
}
