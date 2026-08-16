// Herramientas built-in de mn_mcp_server que el chat NUNCA debe poder llamar,
// sin importar los permisos reales de la API key (defensa en profundidad:
// odoo_run_server_action en particular no comprueba modelo ni permisos en el
// controlador instalado — ver Aprendizajes en PRP-ODOO-003). Cualquier tool
// que NO este en esta lista pasa el filtro, incluidas las Custom Tools que se
// definan en Odoo (Ajustes -> MCP Server -> Custom Tools): esas nunca pueden
// empezar por "odoo_" (el propio modulo lo prohibe), así que quedan fuera de
// este denylist por construccion y su seguridad real la aplica Odoo en base a
// perm_read/perm_write de la key (ver invariantes 3 y 4 de AGENTS.md).
export const ODOO_MCP_DENYLIST = [
  // Escritura / creacion
  'odoo_create',
  'odoo_create_many',
  'odoo_write',
  'odoo_unlink',
  'odoo_copy',
  'odoo_find_or_create',
  'odoo_message_post',
  'odoo_activity_schedule',
  'odoo_send_email',
  'odoo_attach_file',
  // Superficie de riesgo alto: metodos/acciones arbitrarias
  'odoo_execute',
  'odoo_run_server_action',
] as const
