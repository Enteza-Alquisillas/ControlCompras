process.loadEnvFile('.env.local')
import { getOdooMcpTools } from '../src/features/chat/mcp/odooMcpTools.ts'

const { tools, close } = await getOdooMcpTools()

async function probe(name, args) {
  const tool = tools[name]
  if (!tool) { console.log(name, 'NOT FOUND'); return }
  try {
    const result = await tool.execute(args, { messages: [], toolCallId: 'probe' })
    const text = JSON.stringify(result)
    console.log(`=== ${name}(${JSON.stringify(args)}) ===`)
    console.log('chars:', text.length, '-> approx tokens:', Math.round(text.length / 4))
    console.log('sample:', text.slice(0, 500))
  } catch (e) {
    console.log(`=== ${name}(${JSON.stringify(args)}) ERROR ===`)
    console.log(String(e).slice(0, 300))
  }
  console.log()
}

// Previously: no fields, no limit -> ~20,150 chars for 5 rows
await probe('odoo_search_read', { model: 'sale.order.line', domain: [] })
// Previously: unbounded read_group -> ~123,151 chars
await probe('odoo_read_group', { model: 'sale.order.line', domain: [], fields: ['product_uom_qty:sum'], groupby: ['product_id'] })
// Model asks for way more than the cap
await probe('odoo_search_read', { model: 'sale.order.line', domain: [], limit: 500 })

await close()
