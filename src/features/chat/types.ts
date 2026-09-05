// Fuente de datos que consulta el asistente: Machu (copia en Supabase del
// sistema antiguo, SQL Server) u Odoo 19 (ERP nuevo, via MCP).
export type ChatSource = 'machu' | 'odoo'

export const DEFAULT_CHAT_SOURCE: ChatSource = 'odoo'
