# Arquitectura

## Visión general

```text
SQL Server Sevilla/Jerez
       |
       | sync/ (Node 20, cron en CPD)
       v
Supabase/PostgreSQL
       |                         \
       |                          \ chat Machu (solo lectura)
       v                           v
Next.js 16 --------------------> OpenRouter
       |
       +-- exportación Odoo 19 (JSON-2) --> Odoo 19 ORM
       |
       +-- chat Odoo (MCP HTTP) --------> Odoo 19 /mcp
```

La aplicación web es Next.js 16 con TypeScript, React 19, Tailwind, Supabase y
Zustand. `sync/` es un proyecto Node.js independiente: no forma parte del
runtime de Next.js y debe ejecutarse desde una red con acceso a ambos SQL Server.

## Código y rutas

| Ubicación | Responsabilidad |
| --- | --- |
| `src/app/` | Rutas, layouts, autenticación visual y `POST /api/chat`. |
| `src/features/availability/` | Roturas de stock y detalle de artículo. |
| `src/features/reservations/` | Calendario, búsqueda y detalle de contratos. |
| `src/features/import/` | Importación manual desde SQL Server mediante Server Actions. |
| `src/features/odoo/` | Exportador heredado, aislado del flujo Odoo 19. |
| `src/features/odoo19/` | Exportación de alquileres e inventario por JSON-2. |
| `src/features/chat/` | Herramientas Machu y cliente MCP de Odoo. |
| `src/lib/supabase/` | Clientes tipados de navegador, servidor y administrador. |
| `sync/` | Sincronizador SQL Server -> Supabase, CLI y Docker. |

Las rutas principales son `/dashboard`, `/reservations`, `/import`,
`/odoo-export`, `/odoo19-export` y `/chat`. Las rutas de autenticación son
`/login` y `/signup`.

## Datos

El tipo generado `src/lib/supabase/database.types.ts` representa el contrato de
datos actual. Las tablas principales son:

- `warehouses`, `articles`, `article_stock`: catálogo unificado y stock por almacén.
- `customers`: identidad legacy, datos de contacto, `vat` e indicador interno.
- `rentals`, `rental_items`: cabecera y líneas de cada contrato. `rentals.captured_at`
  (`FECHA_CAPTURA`) y `rentals.balance_amount` (`SALDO` = pedido menos abonos)
  vienen de la cabecera del evento; son NULL en contratos sincronizados antes de añadirlos.
- `system_settings`: marcas de la última importación por almacén.

Las migraciones SQL están en `supabase-migrations/`. No se aplican de forma
automática: antes de cambiar esquema, revisa las migraciones existentes y aplica
la nueva en Supabase de forma controlada. Las RPC optimizadas de disponibilidad
son `get_stock_breakages_optimized` y `get_article_reservations_optimized`.

## Sincronización

El proceso `sync/` lee `dbo.ARTICULO_ALQUILER`, `dbo.CLIENTE` y
`dbo.EVENTO_ALQUILER` con sus líneas. Su flujo es:

1. Sincroniza artículos y stock de cada almacén.
2. Sincroniza clientes desde Sevilla como maestro.
3. Sincroniza reservas vigentes de los últimos tres meses y sus líneas para cada almacén.
4. Elimina del espejo las reservas que ya no están vigentes dentro de esa ventana,
   con un freno que aborta si el borrado supera `max(50, 10 %)` de la ventana.
5. Actualiza la marca de importación del almacén si el conjunto correspondiente terminó bien.

El relleno puntual de NIF/CIF (`sync:backfill-vat`) es distinto: consulta los
clientes de ambos SQL Server y solo actualiza `customers.vat` nulo cuando
coinciden identidad legacy, nombre normalizado y NIF/CIF no conflictivo.

## Odoo: carriles separados

La exportación determinista y el chat no comparten cliente, protocolo ni
credencial. Esta separación es obligatoria.

### Exportación a Odoo 19

`src/features/odoo19/` usa JSON-2 por HTTP (`/json/2/<modelo>/<método>`), Bearer
API key y `X-Odoo-Database`. Crea `sale.order` con `is_rental_order=true`.

- Sevilla se resuelve a Visueña; Jerez a Stileum. La compañía y su único almacén
  se descubren por nombre, nunca con IDs fijos.
- Cada llamada usa contexto de compañía y las líneas se clasifican según
  `product.product.rent_ok` en Odoo, no por listas locales de códigos.
- Antes de crear se busca `sale.order` por `client_order_ref` o `name` del
  contrato y compañía. `create` no se reintenta automáticamente: una respuesta
  perdida puede ocultar una transacción confirmada.
- La posición fiscal se toma de la del cliente o de la posición española
  autoaplicable de esa compañía; no se presupone un nombre localizado.
- Tras crear, se guarda el ID y fecha en las columnas `odoo19_*` de `rentals`.

El exportador heredado de `src/features/odoo/` permanece separado y conserva sus
propias columnas `odoo_*`.

### Chat Odoo

`src/features/chat/mcp/` abre un cliente MCP HTTP contra `/mcp`, descubre las
herramientas y bloquea todas las de escritura o acción de alto riesgo. El chat
es de consulta. Las Custom Tools de Odoo siguen disponibles si no usan los
nombres built-in bloqueados.

La implementación actual usa una sola clave de entorno `ODOO_MCP_API_KEY`. No
es adecuada para producción multiusuario mientras no se resuelva una identidad
Odoo por usuario con token individual u OAuth. Consulta `AGENTS.md` para las
invariantes de seguridad, el fork requerido de `mn_mcp_server` y las condiciones
de despliegue.

## Chat Machu

El endpoint `/api/chat` permite dos fuentes:

- **Machu**: modelo de OpenRouter y herramientas de solo lectura sobre Supabase.
- **Odoo**: modelo de OpenRouter y herramientas MCP de Odoo.

El selector determina la fuente. Machu opera sobre la copia legacy y puede estar
desactualizado respecto a Odoo; Odoo consulta el ERP directamente.
