import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'

// Tiempo maximo para conectar + completar el handshake "initialize" con Odoo.
// Sin esto, si el servidor MCP de Odoo esta caido o la red se queda colgada,
// createMCPClient() puede no resolver nunca (visto en produccion: el chat se
// queda "pensando" indefinidamente sin ningun error). initializationOptions
// acota la propia llamada MCP; el timeout manual de abajo es un backstop por
// si la libreria no lo respeta para algun transporte.
const CONNECT_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: timeout tras ${ms}ms`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

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
    return await withTimeout(
      createMCPClient({
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
        initializationOptions: { timeout: CONNECT_TIMEOUT_MS, maxTotalTimeout: CONNECT_TIMEOUT_MS },
      }),
      CONNECT_TIMEOUT_MS,
      'createOdooMcpClient',
    )
  } catch (error) {
    console.error('[odooMcpClient] No se pudo conectar al MCP de Odoo:', error)
    return null
  }
}
