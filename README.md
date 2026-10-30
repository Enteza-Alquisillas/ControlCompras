# Enteza Reservas

Aplicación para consultar la disponibilidad de material de alquiler, visualizar
reservas del sistema legacy y exportar pedidos a Odoo. Opera con los almacenes
de Sevilla y Jerez.

## Documentación canónica

- [Arquitectura](ARCHITECTURE.md): componentes, datos, integraciones y decisiones técnicas.
- [Reglas de negocio](BUSINESS_LOGIC.md): disponibilidad, fechas y terminología del alquiler.
- [Operación](OPERATIONS.md): configuración, validación, despliegue y recuperación.
- [Sincronizador SQL Server](sync/README.md): ejecución y mantenimiento del servicio independiente.
- [Instrucciones para agentes](AGENTS.md): invariantes de Odoo/MCP y reglas de contribución.

Los documentos de `.claude/` que permanecen son infraestructura reutilizable de
agentes y plantillas; no describen el estado funcional del producto.

## Capacidades

- Disponibilidad y roturas de stock a partir de reservas y stock sincronizados.
- Calendario y detalle de contratos del sistema legacy.
- Sincronización SQL Server (Sevilla/Jerez) a Supabase.
- Exportación independiente a Odoo legacy y a Odoo 19.
- Chat de consulta de solo lectura sobre Machu (Supabase) u Odoo 19 (MCP).

## Requisitos y arranque

Requiere Node.js 20 o posterior. La aplicación usa Supabase y necesita las
credenciales de los servicios externos que correspondan al entorno.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Completa `.env.local` con credenciales válidas del entorno. Nunca publiques ni
copies claves de producción a un archivo versionado. Consulta [Operación](OPERATIONS.md)
para el listado de variables y para el sincronizador, que usa su propio
`sync/.env`.

## Validación

```bash
npx tsc --noEmit
npm run build

cd sync
npm run typecheck
```

`npm run lint` no es actualmente un comando válido con la versión instalada de
Next.js; no lo uses como señal de calidad hasta que se sustituya por una
configuración directa de ESLint.

## Estructura

```text
src/app/          Rutas Next.js, layouts y API de chat
src/features/     Funcionalidad por dominio
src/lib/          Clientes de Supabase e IA
supabase-migrations/  SQL versionado aplicado manualmente a Supabase
sync/             CLI y contenedor independiente SQL Server -> Supabase
scripts/          Utilidades operativas y pruebas manuales
```

La aplicación web y `sync/` son procesos distintos: el primero sirve la UI y
las acciones de exportación; el segundo se ejecuta cerca de los SQL Server.
