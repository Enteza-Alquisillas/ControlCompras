# PRP-ODOO-002: Exportacion de alquileres a Odoo 19 Enterprise

> **Estado**: EN PROGRESO
> **Fecha**: 2026-08-02
> **Proyecto**: Enteza Reservas App

---

## Objetivo

Incorporar una integracion independiente que exporte reservas desde Enteza Reservas a Odoo 19 Enterprise (`enteza26`) como pedidos del modulo nativo `sale_renting`. La integracion actual con Odoo 15 Community se conservara sin cambios de logica ni de datos.

## Por Que

| Problema | Solucion |
|----------|----------|
| El exportador actual crea pedidos para el modulo de alquiler de terceros de Odoo 15. | Crear un exportador separado que use los modelos y campos del alquiler nativo de Odoo 19. |
| La operativa pasa a dos companias en Odoo 19. | Resolver compania y almacen por el almacen de origen de cada reserva. |
| El marcador de exportacion actual identifica pedidos de Odoo 15. | Registrar la exportacion a Odoo 19 en campos independientes, sin afectar el historial de Odoo 15. |

**Valor de negocio**: desde el lunes los pedidos de Sevilla y Jerez podran generarse en la nueva instancia operativa de Odoo 19, dentro de su compania y circuito nativo de alquiler, mientras se conserva el exportador Odoo 15 como respaldo durante el periodo paralelo.

## Que

### Criterios de Exito
- [ ] El exportador existente de Odoo 15 conserva sus servicios, accion, interfaz y marcadores actuales sin cambios funcionales.
- [ ] La nueva pantalla de Odoo 19 permite seleccionar reservas pendientes y crear un `sale.order` de alquiler nativo por cada una.
- [ ] Una reserva de `SEVILLA` se crea en Visuena y una de `JEREZ` en Stileum, cada una con el almacen perteneciente a su compania.
- [ ] El pedido Odoo 19 tiene `is_rental_order=true`, `rental_start_date`, `rental_return_date` y lineas con el producto fisico alquilable (`rent_ok=true`); no usa servicios rental de Odoo 15 ni escribe campos de fecha calculados de linea.
- [ ] Una exportacion correcta guarda el identificador y fecha de Odoo 19 sin modificar `odoo_order_id` ni `odoo_synced_at`.
- [ ] La configuracion Odoo 19 vive exclusivamente en variables de entorno de servidor, sin credenciales ni IDs fijos en el codigo.

### Comportamiento Esperado

1. El usuario abre la nueva opcion de exportacion a Odoo 19 y filtra reservas por fecha de evento.
2. La tabla muestra el estado de exportacion especifico de Odoo 19 y permite seleccionar solo las pendientes para ese destino.
3. Al exportar una reserva, el servidor determina su almacen de origen.
4. `SEVILLA` se resuelve contra la compania Visuena y su almacen; `JEREZ`, contra Stileum y el suyo.
5. El servidor autentica contra `enteza26`, busca el partner y los productos fisicos por referencia interna, valida que los productos sean alquilables y crea el pedido de alquiler nativo.
6. Las fechas de entrega y recogida se convierten a datetimes de cabecera. Si ambas fechas son el mismo dia, la recogida se ajusta a `23:59:59` para cumplir la restriccion estricta de Odoo 19.
7. Tras crear el pedido, se guarda el ID y timestamp de Odoo 19 en Supabase y el resultado se muestra individualmente para cada reserva. Un fallo de una reserva no interrumpe las demas.

---

## Contexto

### Referencias
- `src/features/odoo/` - Exportador actual de Odoo 15 que debe conservarse intacto.
- `src/features/odoo/services/odooSaleOrderService.ts` - Contiene campos exclusivos de alquiler Odoo 15 que no se reutilizaran para Odoo 19.
- `supabase-migrations/add-odoo-fields-to-rentals.sql` - Marcadores actuales exclusivos de Odoo 15.
- `E:/apps/AI/MigrarOdoo/.claude/skills/odoo-ops/references/conexiones-y-conectores.md` - Instancia destino, protocolo y companias verificados.
- `E:/apps/AI/MigrarOdoo/.claude/skills/odoo-ops/references/modelos-15-19.md` - Esquema de alquiler nativo Odoo 19 verificado.
- `E:/apps/AI/MigrarOdoo/.claude/skills/odoo-ops/references/pedidos-alquiler.md` - Restricciones reales del modulo rental y casos de fechas.
- `E:/apps/AI/MigrarOdoo/src/features/connections/services/odoo-rpc.ts` - Patron JSON-RPC robusto, con reintentos y errores de aplicacion no reintentables.

### Decisiones Tecnicas

- Se creara una feature separada `odoo19`; no se bifurcara con condicionales la implementacion de Odoo 15.
- Odoo 19 se configurara con `ODOO19_URL`, `ODOO19_DB`, `ODOO19_USER` y `ODOO19_API_KEY`. Las variables solo se leen en el servidor.
- La compania y el almacen se resolveran por nombre/codigo y con contexto multi-compania; no se usaran IDs fijos. Regla de negocio: `SEVILLA` -> Visuena; `JEREZ` -> Stileum.
- Los productos se buscaran por `articles.code`/`product.product.default_code`. Cada producto debe ser fisico y tener `rent_ok=true`.
- Las lineas se crearan con `product_id`, `product_uom_qty` e `is_rental=true`. No se escribiran `sale.order.line.start_date`, `return_date` ni `event_date`, porque son campos calculados no almacenados en Odoo 19.
- Las lineas sin producto resoluble fallaran de forma explicita para esa reserva. No se crearan lineas de nota que oculten un fallo de inventario/alquiler.
- El nuevo cliente usara JSON-RPC clasico `/jsonrpc`, compatible con la instancia actual de Odoo 19. Se aplicaran reintentos solo para red/5xx y contexto sin chatter en cada escritura.

### Arquitectura Propuesta (Feature-First)

```
src/features/odoo19/
├── actions/
│   └── odoo19ExportActions.ts       # Exportacion y desmarcado exclusivos de Odoo 19
├── components/
│   ├── Odoo19ExportPage.tsx         # Pantalla independiente de Odoo 19
│   ├── Odoo19RentalsSelectionTable.tsx
│   ├── Odoo19ExportSummaryPanel.tsx
│   └── Odoo19ExportResultModal.tsx
├── hooks/
│   ├── useOdoo19Export.ts
│   └── useRentalsForOdoo19Export.ts
├── services/
│   ├── odoo19Client.ts              # JSON-RPC y contexto multi-compania
│   ├── odoo19RentalOrderService.ts  # Pedido rental nativo
│   ├── odoo19ResolverService.ts     # Compania, almacen, partner y producto
│   └── rentalsOdoo19ExportService.ts
├── types/
│   └── index.ts
└── index.ts

src/app/(main)/odoo19-export/
└── page.tsx
```

### Modelo de Datos

```sql
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS odoo19_order_id INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo19_synced_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo19_company_code TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_rentals_odoo19_order_id
  ON public.rentals (odoo19_order_id)
  WHERE odoo19_order_id IS NOT NULL;

COMMENT ON COLUMN public.rentals.odoo19_order_id IS
  'ID del sale.order de alquiler nativo creado en Odoo 19. NULL = no exportado a Odoo 19.';
COMMENT ON COLUMN public.rentals.odoo19_company_code IS
  'Compania destino de Odoo 19: VISUENA o STILEUM.';
```

No se modifican `odoo_order_id` ni `odoo_synced_at`, que conservan su significado actual para Odoo 15.

---

## Blueprint (Assembly Line)

### Fase 1: Persistencia y configuracion de Odoo 19
**Objetivo**: Preparar los marcadores de exportacion independientes, tipos Supabase y variables de entorno de servidor para Odoo 19.
**Validacion**: La base de datos conserva los campos de Odoo 15 y permite distinguir por separado las exportaciones de Odoo 19.

### Fase 2: Cliente y resolucion multi-compania
**Objetivo**: Implementar el cliente JSON-RPC de Odoo 19 y la resolucion segura de compania, almacen, partner y productos fisicos alquilables.
**Validacion**: Pruebas controladas resuelven Visuena/Sevilla y Stileum/Jerez sin IDs hardcodeados y rechazan productos no alquilables.

### Fase 3: Creacion del pedido rental nativo
**Objetivo**: Crear pedidos `sale.order` de alquiler Odoo 19 con cabecera, fechas y lineas compatibles con `sale_renting`, aislando errores por reserva.
**Validacion**: Un pedido de prueba por cada almacen genera una cotizacion rental con compania, almacen, fechas y productos correctos en Odoo 19.

### Fase 4: Interfaz y trazabilidad de exportacion
**Objetivo**: Crear una pantalla Odoo 19 independiente que permita filtrar, seleccionar, exportar y consultar/desmarcar su estado sin alterar la pantalla Odoo 15.
**Validacion**: La UI diferencia claramente ambos destinos y no permite reexportar una reserva ya marcada en Odoo 19.

### Fase 5: Validacion Final
**Objetivo**: Sistema funcionando end-to-end sin regresiones en la exportacion Odoo 15.
**Validacion**:
- [ ] `npm run typecheck` pasa.
- [ ] `npm run build` es exitoso.
- [ ] Pruebas controladas en Odoo 19 verifican una reserva Sevilla/Visuena y una Jerez/Stileum.
- [ ] La exportacion existente a Odoo 15 mantiene su comportamiento.
- [ ] Los criterios de exito se cumplen.

---

## Aprendizajes (Self-Annealing / Neural Network)

> Esta seccion crecera durante la implementacion.

---

## Gotchas

- [ ] Odoo 19 exige estrictamente `rental_start_date < rental_return_date`; una reserva de un dia debe devolver a las `23:59:59`.
- [ ] Las fechas `start_date`, `return_date` y `event_date` de `sale.order.line` son calculadas/no almacenadas: no escribirlas.
- [ ] Odoo 19 usa el producto fisico rentable (`rent_ok=true`), no los productos-servicio de la integracion Odoo 15.
- [ ] Toda llamada y escritura Odoo 19 debe ejecutarse con contexto multi-compania y sin chatter.
- [ ] Las credenciales y claves API nunca se incluyen en codigo, logs ni archivos versionados.

## Anti-Patrones

- No modificar el flujo ni los servicios existentes de `src/features/odoo/`.
- No reutilizar campos exclusivos del alquiler Odoo 15 en Odoo 19.
- No usar IDs fijos para companias, almacenes, productos o partners.
- No reutilizar `odoo_order_id` para marcar exportaciones de Odoo 19.
- No crear lineas de nota como sustituto silencioso de productos no resolubles.
- No omitir validacion de entradas ni manejo de errores por reserva.

---

*PRP pendiente de aprobacion. No se ha modificado codigo de producto.*
