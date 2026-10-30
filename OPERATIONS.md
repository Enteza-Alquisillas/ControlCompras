# Operación

## Configuración de la aplicación web

La configuración local vive en `.env.local`, que nunca se versiona. Usa
`.env.example` solo como inventario de nombres y reemplaza sus valores por
credenciales del entorno.

| Grupo | Variables |
| --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Importación manual | `SEVILLA_SQL_*`, `JEREZ_SQL_*` |
| Chat | `OPENAI_API_KEY`, `OPENAI_MODEL`, `ODOO_MCP_URL`, `ODOO_MCP_API_KEY`, `ODOO_MCP_DB` |
| Exportación Odoo 19 | `ODOO19_URL`, `ODOO19_DB`, `ODOO19_API_KEY`, `ODOO19_SEVILLA_COMPANY`, `ODOO19_JEREZ_COMPANY` |

Las claves del navegador se limitan a `NEXT_PUBLIC_*`. Ninguna API key de Odoo,
OpenRouter, SQL Server o service role puede exponerse al cliente. En Vercel deben
existir las mismas variables necesarias para las rutas que se ejecuten allí.

## Desarrollo y comprobaciones

```bash
npm install
npm run dev
npx tsc --noEmit
npm run build
```

El build es la comprobación integral de la aplicación web. Los scripts de prueba
en `scripts/` son diagnósticos manuales que requieren sus credenciales; no son
una suite de CI.

## Despliegue web

El `Dockerfile` raíz construye la aplicación y `docker-compose.yml` la expone en
el puerto 3000 con `.env.local`. El despliegue puede hacerse también en Vercel.
Antes de publicar:

1. Ejecuta `npx tsc --noEmit` y `npm run build`.
2. Revisa que las variables de entorno del destino correspondan al entorno Odoo
   y Supabase esperado.
3. Para exportación Odoo 19, prueba un pedido en entorno de pruebas antes de
   apuntar a producción.
4. Para chat Odoo, verifica las restricciones indicadas en `AGENTS.md`.

## Seguridad y recuperación

- Rota inmediatamente cualquier secreto expuesto fuera de un gestor de secretos.
- Usa claves Odoo separadas para JSON-2 y MCP.
- El chat MCP debe ser de solo lectura y conservar el denylist de herramientas.
- No reintentes manual ni automáticamente un `sale.order.create` sin comprobar
  primero la referencia de contrato en Odoo.
- Si una exportación creó el pedido pero no guardó la traza en Supabase, localiza
  el pedido por `client_order_ref`/`name`, verifica la compañía y registra el ID
  en `odoo19_order_id`; no crees otro pedido.

## Sincronizador

La operación detallada del proceso SQL Server -> Supabase está en
[sync/README.md](sync/README.md). El servicio requiere una red con acceso a los
dos SQL Server y usa `sync/.env`, no `.env.local`.
