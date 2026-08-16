process.loadEnvFile('.env.local')
import { getOdooMcpTools } from '../src/features/chat/mcp/odooMcpTools.ts'

const { tools, close } = await getOdooMcpTools()
console.log('Tool names exposed to the model:', Object.keys(tools))

if (tools.odoo_search_read) {
  const result = await tools.odoo_search_read.execute(
    { model: 'res.partner', domain: [['name', 'ilike', 'SCANIA']], fields: ['id', 'name'], limit: 5 },
    { messages: [], toolCallId: 'test-1' }
  )
  console.log('odoo_search_read result:', JSON.stringify(result))
}

await close()
