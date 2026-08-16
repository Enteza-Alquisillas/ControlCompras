import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'

// Cliente MCP hacia Odoo 19 (mn_mcp_server). Carril conversacional, completamente
// separado del cliente JSON-2 usado por la exportacion determinista en
// src/features/odoo19/ (protocolo, credencial y ciclo de vida propios).
// Ver AGENTS.md secciones 2-4 y PRP-ODOO-003.
export async function createOdooMcpClient(): Promise<MCPClient | null> {
  const url = process.env.ODOO_MCP_URL
  const apiKey = process.env.ODOO_MCP_API_KEY
  const database = process.env.ODOO_MCP_DB

  if (!url || !apiKey || !database) {
    return null
  }

  try {
    return await createMCPClient({
      transport: {
        type: 'http',
        url,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // Instancia multi-base: sin esta cabecera Odoo responde 404
          // "No database is selected" antes de llegar al controlador /mcp.
          'X-Odoo-Database': database,
        },
      },
    })
  } catch (error) {
    console.error('[odooMcpClient] No se pudo conectar al MCP de Odoo:', error)
    return null
  }
}
