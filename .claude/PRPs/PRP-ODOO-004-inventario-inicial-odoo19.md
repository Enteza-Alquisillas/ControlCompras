# PRP-ODOO-004: Carga de inventario inicial en Odoo 19

> **Estado**: COMPLETADO
> **Fecha**: 2026-08-17
> **Proyecto**: Enteza Reservas App

---

## Objetivo

Cargar en Odoo 19 (`enteza`) las existencias reales de los artículos de alquiler que no están de baja, tomadas en vivo de los SQL Server legacy (Sevilla y Jerez), como ajuste de inventario por almacén/compañía, integrado como una acción manual dentro del menú "Importar" que solo puede ejecutarse en local (acceso a la intranet).

## Por Qué

| Problema | Solución |
|----------|----------|
| Odoo 19 no tiene existencias reales cargadas; el módulo de alquiler nativo no puede informar disponibilidad real por compañía. | Ajuste de inventario inicial por producto y almacén, calculado desde la fuente legacy en el momento de ejecutar. |
| El espejo en Supabase (`articles` / `article_stock`) puede estar desactualizado frente al SQL Server real (verificado: Jerez tenía 164 artículos con stock en Supabase frente a 52 reales). | Leer artículos y existencias directamente de `dbo.ARTICULO_ALQUILER` en el momento de la carga, no desde Supabase. |
| Hay artículos activos en el legacy sin producto correspondiente en Odoo, productos archivados por error y códigos duplicados. | Reconciliación explícita antes de escribir: crear, excluir o resolver caso por caso, nunca silenciosamente. |

**Valor de negocio**: Odoo 19 pasa a reflejar el inventario real de ambas compañías (Visueña/Sevilla y Stileum/Jerez), habilitando informes de existencias fiables sin depender del sistema legacy.

## Qué

### Criterios de Éxito
- [ ] La carga lee artículos y existencias en vivo desde `dbo.ARTICULO_ALQUILER` (Sevilla y Jerez), no desde Supabase.
- [ ] Cada artículo con existencia > 0 y `BAJA = 0` queda como ajuste de inventario (`stock.quant`) en la ubicación de stock del almacén correcto (`SEV/Stock` para Sevilla, `JER/Stock` para Jerez), resuelta dinámicamente (sin IDs fijos).
- [ ] Los 6 artículos "SOBRE VENTA..." (`ART-4502` a `ART-4507`, existencia ficticia `9999` en ambos almacenes) quedan excluidos por completo: no se crean, no reciben ajuste de stock.
- [ ] Los artículos activos en el legacy sin producto en Odoo se crean con `default_code` numérico (sin prefijo `ART-`, igual que el catálogo existente), `rent_ok=true`, `type=consu`, UoM Units, **sin compañía asignada** (`company_id` vacío) para uso desde ambas compañías.
- [ ] Los 2 productos archivados detectados (`3666`, `4514`) quedan fuera de la carga automática hasta resolverse manualmente (ver Gotchas); la carga no falla por ellos, los reporta como pendientes.
- [ ] La acción vive como una tarjeta más dentro de `ImportWizard` (menú "Importar"), ejecutable solo en local.
- [ ] Antes de aplicar cualquier ajuste, se muestra una vista previa (cantidad actual en Odoo vs. cantidad a fijar) por artículo/almacén; la aplicación real requiere confirmación explícita.
- [ ] Reejecutar la carga es seguro: al fijar `inventory_quantity` de forma absoluta (no incremental), una segunda ejecución reconcilia Odoo con el legacy sin duplicar stock.
- [ ] `npm run build`/`tsc --noEmit` pasan sin errores.

### Comportamiento Esperado
1. El usuario abre "Importar" y ve una nueva tarjeta "Inventario Odoo 19" junto a las de Artículos/Clientes/Reservas.
2. Al pulsar "Previsualizar", el servidor consulta en vivo `ARTICULO_ALQUILER` (Sevilla + Jerez, `BAJA=0`, `EXISTENCIA>0`), aplica la unificación de IDs Sevilla/Jerez ya existente, excluye los 6 códigos "SOBRE VENTA", resuelve cada producto en Odoo 19 por `default_code` y calcula el ajuste necesario por almacén.
3. Se muestra una tabla: artículos sanos a actualizar, artículos nuevos a crear, artículos archivados pendientes de resolución manual (con motivo), y totales.
4. El usuario revisa y pulsa "Aplicar". El servidor crea los productos que falten (sin compañía), fija `inventory_quantity` en el quant de la ubicación correspondiente y llama a `action_apply_inventory`.
5. El resultado se muestra por artículo (éxito/error), igual que el patrón ya usado en la exportación de pedidos a Odoo 19. Un fallo puntual no bloquea el resto.

---

## Contexto

### Referencias
- `src/features/import/services/legacyService.ts` — patrón de conexión SQL Server por almacén (`mssql`), reutilizar para la query de artículos con `EXISTENCIA > 0`.
- `src/features/import/actions/importActions.ts` — patrón de Server Action, chunking (`processInChunks`) y registro de última ejecución (`saveLastImportDate` / tabla `system_settings`).
- `src/features/import/components/ImportWizard.tsx` — UI a extender con la nueva tarjeta.
- `src/features/odoo19/services/odoo19Client.ts` — cliente JSON-2; solo expone `searchRead` y `create`. Hay que añadir métodos genéricos `write` y `callMethod` (para `action_apply_inventory`).
- `src/features/odoo19/services/odoo19RentalOrderService.ts` — `companyContext()`, `resolveDestination()` (compañía + almacén por código `SEVILLA`/`JEREZ`) y `findRentalProduct()` (resolución de producto por `default_code`, con fallback sin prefijo `ART-`); toda esta lógica se reutiliza, y `resolveDestination` se extiende para traer también `lot_stock_id` del almacén.
- `.claude/PRPs/PRP-ODOO-002-exportacion-odoo19-rental.md` — antecedente directo: mismo patrón multi-compañía, mismo estilo de aislar errores por registro.

### Decisiones Técnicas
- La fuente de artículos/existencias es **siempre** el SQL Server legacy en el momento de ejecutar, nunca la tabla `articles`/`article_stock` de Supabase (puede estar desfasada).
- Esta acción solo puede ejecutarse en local (acceso a la intranet de SQL Server), igual que el resto del `ImportWizard` actual; no se expone como cron ni se ejecuta en Vercel.
- Compañía/almacén se resuelven dinámicamente por nombre (`ODOO19_SEVILLA_COMPANY`/`ODOO19_JEREZ_COMPANY`) y código, sin IDs fijos — mismo patrón que `resolveDestination`.
- Los productos nuevos se crean **sin compañía** (`company_id` vacío/`false`), igual que el resto del catálogo ya existente en Odoo (verificado: los 910 productos sanos actuales tienen `company_id: false`).
- Ajuste de stock vía `stock.quant`: buscar quant existente por `(product_id, location_id)`; si existe, `write` de `inventory_quantity`; si no, `create`; después `action_apply_inventory` sobre el/los id(s) resultantes. Nunca escribir directamente el campo `quantity` (Odoo lo bloquea).
- Exclusión explícita por lista de códigos (`EXCLUDED_INVENTORY_CODES`), mismo patrón que `EXCLUDED_CUSTOMERS` en `importActions.ts`.
- La carga es idempotente por diseño (fija cantidad absoluta), por lo que puede quedar como botón reutilizable para recargas futuras sin riesgo de duplicar stock.

### Arquitectura Propuesta (Feature-First)
```
src/features/odoo19/
├── services/
│   ├── odoo19Client.ts                    # + write(), + callMethod()
│   ├── odoo19InventoryService.ts          # NUEVO: extracción legacy + resolución + ajuste de quants
│   └── odoo19WarehouseResolver.ts         # NUEVO: extraído de resolveDestination() para reutilizar en rental order e inventario
├── actions/
│   └── odoo19InventoryActions.ts          # NUEVO: previewInventoryLoad(), applyInventoryLoad()
└── types/
    └── index.ts                           # + tipos de preview/resultado de inventario

src/features/import/
└── components/
    ├── ImportWizard.tsx                   # + tarjeta "Inventario Odoo 19"
    └── Odoo19InventoryPreviewModal.tsx     # NUEVO: tabla de previsualización + confirmación
```

### Modelo de Datos
No requiere tablas nuevas en Supabase (la fuente es SQL Server, el destino es Odoo). Se reutiliza `system_settings` para trazabilidad, igual que `last_import_sevilla`/`last_import_jerez`:

```sql
-- Sin migración: se usa upsert sobre system_settings ya existente
-- key = 'last_odoo19_inventory_load', value = timestamp ISO
```

---

## Blueprint (Assembly Line)

### Fase 1: Extracción legacy y reconciliación con Odoo
**Objetivo**: Servicio que, dado ambos almacenes, obtiene artículos activos con existencia > 0 desde SQL Server, aplica la unificación Sevilla/Jerez, excluye los 6 códigos "SOBRE VENTA" y reconcilia cada código contra `product.product` en Odoo (sano / archivado / inexistente).
**Validación**: Ejecutar en modo solo-lectura y comparar el resumen contra los números ya verificados manualmente (910 sanos, 43 a crear, 2 archivados pendientes, 6 excluidos).

### Fase 2: Cliente Odoo extendido y ajuste de stock
**Objetivo**: `Odoo19Client` gana `write`/`callMethod`; `odoo19InventoryService` resuelve `lot_stock_id` por compañía/almacén, crea productos faltantes sin compañía, y aplica el ajuste de quant (`inventory_quantity` + `action_apply_inventory`) por artículo/almacén.
**Validación**: Prueba controlada de extremo a extremo contra 2-3 artículos reales (uno nuevo, uno existente) en Sevilla y Jerez, confirmando en Odoo (Inventario → Existencias) el valor exacto esperado.

### Fase 3: Integración en el menú Importar
**Objetivo**: Nueva tarjeta en `ImportWizard` con flujo previsualizar → revisar tabla (sanos a actualizar / a crear / archivados pendientes / excluidos) → confirmar → aplicar, con resultado por artículo.
**Validación**: Flujo completo probado desde la UI en local; un fallo puntual de un artículo no detiene el resto y queda listado como error.
**Estado**: Construido — `odoo19InventoryActions.ts` (server actions con auth, recalcula el preview en el servidor al aplicar) y `Odoo19InventoryPreviewModal.tsx` (tarjeta en `ImportWizard`). `tsc --noEmit` limpio. Verificación visual en navegador pendiente de confirmación manual del usuario (no se pudo autenticar en el QA automático).

### Fase 4: Validación Final
**Objetivo**: Sistema funcionando end-to-end sin regresiones en el resto del `ImportWizard` ni en la exportación de pedidos.
**Validación**:
- [x] `npx tsc --noEmit` pasa.
- [x] `npm run build` exitoso (todas las rutas, incluida `/import`, compilan y generan sin errores).
- [x] Carga real completa ejecutada y verificada contra Odoo 19 el 2026-08-17: **992/992 ajustes correctos, 0 fallidos** (911 productos ya sanos + 42 productos nuevos creados = 953 artículos distintos, con Sevilla y/o Jerez). Verificado por agregado en Odoo: 953 productos con stock>0 en `SEV/Stock`, 44 en `JER/Stock`. Los 2 de revisión manual (3666, 4514), los 7 `type=service` y los 6 "SOBRE VENTA" quedaron fuera tal como estaba diseñado.
- [x] Los criterios de éxito de código se cumplen (creación sin compañía, exclusión de SOBRE VENTA, revisión manual de 3666/4514, idempotencia por diseño).

---

## Aprendizajes (Self-Annealing / Neural Network)

### 2026-08-17: Supabase no es fuente fiable para esta carga
- **Error**: `article_stock` en Supabase mostraba 164 artículos con existencia en Jerez; el SQL Server real solo tiene 52.
- **Fix**: Esta carga consulta siempre el SQL Server legacy en vivo, nunca el espejo de Supabase.
- **Aplicar en**: Cualquier integración futura que necesite existencias exactas al momento.

### 2026-08-17: "Archivado" en Odoo no siempre significa lo mismo
- **Contexto**: Se esperaba que `3666` y `4514` estuvieran archivados por el mismo motivo (código duplicado con un producto activo).
- **Hallazgo real**:
  - `3666` (legacy: "VITRINA MURAL", existencia 4 en Sevilla): SÍ hay conflicto real. El producto activo con `default_code=3666` es `id=1905 "CAMARA FRIGORIFICA 4 PUERTAS (copia)"` — un duplicado erróneo de `id=91 "CAMARA FRIGORIFICA 4 PUERTAS" (default_code=3691)`, que se quedó con el código equivocado. El producto correcto y archivado es `id=1503 "VITRINA MURAL"`. Antes de reactivar `id=1503` hay que liberar el código en `id=1905` (cambiar/vaciar su `default_code`, es un duplicado real que no debería tener referencia interna propia).
  - `4514` (legacy: "TRASPALET ELECTRICO", existencia 6 en Sevilla + 1 en Jerez): NO hay ningún producto activo con ese código ni con ese nombre. Es un archivado simple, mismo patrón que el caso original de `ART-3517` — se puede reactivar directamente sin conflicto.
- **Fix**: No asumir el mismo tratamiento para ambos. `4514` se reactiva sin más. `3666` requiere primero una limpieza manual en Odoo (resolver el duplicado `id=1905`) antes de reactivar `id=1503`; la carga automática debe excluir ambos hasta que estén resueltos y reportarlos como pendientes, no fallar silenciosamente ni adivinar cuál es el producto correcto.
- **Aplicar en**: Cualquier reconciliación automática de catálogo Odoo; nunca asumir que "archivado" implica una causa única sin comprobarlo producto a producto.

### 2026-08-17: `legacyService` usa el pool global de mssql — inseguro en paralelo
- **Error**: Al consultar Sevilla y Jerez con `Promise.all`, una de las dos consultas fallaba con `Invalid column name 'ID_MATERIAL_SEVILLA'` (columna que sí existe en Jerez pero no en Sevilla). `legacyService.getLegacyData` usa `sql.connect(config)` de `mssql`, que gestiona un pool de conexión **global**; dos llamadas casi simultáneas con configuraciones (servidor) distintas compiten por ese pool y una puede acabar ejecutando su query contra el servidor de la otra.
- **Fix**: `getLegacyInventorySnapshot()` en `odoo19InventoryService.ts` consulta Sevilla y Jerez **en secuencia** (`await` uno tras otro), no en paralelo. No se tocó `legacyService.ts` para no afectar al import existente.
- **Aplicar en**: Cualquier código nuevo que llame a `legacyService.getLegacyData` para ambos almacenes en la misma operación. Si en el futuro se necesita paralelismo real, `legacyService.ts` debe migrar a `new sql.ConnectionPool(config).connect()` (pool por llamada) en vez del `sql.connect()` global.

### 2026-08-17: `type=service` en Odoo no lleva inventario
- **Error**: La primera versión de la reconciliación contaba como "sano" cualquier producto activo y `rent_ok=true`, sin mirar `type`. 7 de los 968 códigos son productos `type=service` en Odoo (sin stock.quant asociable).
- **Fix**: Se añadió el campo `type` a la búsqueda y un estado `not_stockable` separado; estos artículos se reportan pero no reciben ajuste de inventario.
- **Aplicar en**: Cualquier lógica futura que decida si un producto de Odoo puede recibir stock.

### 2026-08-17: Odoo 19 requiere `is_storable=true`, `type='consu'` no basta
- **Error**: Al crear un producto nuevo con `type: 'consu'` (sin `is_storable`), el alta se creaba bien pero `stock.quant.create` fallaba con `"Quants cannot be created for consumables or services"`. En este Odoo 19, el antiguo tercer tipo "Producto almacenable" ya no existe como `type`; ahora es `type='consu'` + el booleano `is_storable=true` el que habilita el tracking de stock (verificado contra un producto sano real: `type: 'consu', is_storable: true`).
- **Fix**: `createMissingProduct()` añade `is_storable: true` a los valores de creación. Se comprobó a escala (`rent_ok=true AND type=consu AND is_storable=false`) que solo 3 productos del catálogo completo tienen esta combinación rota: el propio producto de prueba (corregido a mano) y dos duplicados huérfanos sin `default_code` (`[2980] MESA ALTA... (Alquiler)`, `[4736] COJIN... (Alquiler)`) que no interfieren porque nunca los encuentra la búsqueda por código — los códigos 2980 y 4736 reales ya resuelven a otros productos sanos y correctos.
- **Fix probado también**: `product.product.create` con `uom_po_id` falla con `Invalid field 'uom_po_id' in 'product.product'` — ese campo no existe en esta versión; basta con `uom_id`.
- **Verificado en real**: prueba controlada de extremo a extremo con 2 artículos (uno existente `id=104`, uno nuevo creado `id=1929`) en Sevilla y Jerez. Quants resultantes exactos: `SEV/Stock=8, JER/Stock=4` (104) y `SEV/Stock=71` (1929), sin afectar el quant preexistente de "Customers/Alquiler" (unidades ya alquiladas). El flujo `write`/`create` + `action_apply_inventory` funciona tal como se diseñó: tras aplicar, `inventory_quantity` vuelve a 0 y Odoo genera automáticamente la contrapartida en la ubicación virtual "Inventory adjustment" de cada compañía — esa es la traza del ajuste, no hace falta un campo de motivo aparte.
- **Aplicar en**: Cualquier creación futura de productos alquilables/almacenables en este Odoo 19.

### 2026-08-17: La conexión a SQL Server Sevilla es intermitente, no fiable a la primera
- **Contexto**: Varias veces durante el desarrollo, la conexión a `192.168.100.222\SQLEXPRESS` (Sevilla) dio timeout (`ETIMEOUT`, 15s) y al reintentar sin cambios funcionó. Un chequeo de red confirmó en un momento dado que ni ping ni TCP:1433 respondían (VPN/intranet caída), y tras reconectar la VPN volvió a funcionar de forma intermitente.
- **Fix**: No es un bug de código; la UI de la Fase 3 debe mostrar un error claro y accionable ("no se pudo conectar a SQL Server, comprueba la VPN/intranet") en vez de fallar en silencio, y permitir reintentar sin recargar toda la página.
- **Aplicar en**: Cualquier pantalla que dependa de `legacyService` en producción/local.

### 2026-08-17: Jerez (`192.168.100.242`) también fallando, incluso con VPN conectada
- **Contexto**: Probando la tarjeta ya integrada en `/import`, la previsualización falló repetidamente con `Failed to connect to 192.168.100.242\SQLEXPRESS in 15000ms`, confirmado con la VPN activa (no es el mismo caso que el de Sevilla, donde la VPN estaba desconectada). Reintentar desde el botón del modal no lo resolvió en el momento.
- **Fix**: Se añadió reintento con backoff (`getLegacyArticlesWithRetry`, 3 reintentos: 2s/5s/10s) alrededor de la conexión inicial a cada SQL Server en `odoo19InventoryService.ts`. Con esto, la carga completa real (992 operaciones) se ejecutó sin fallos en el siguiente intento. La causa raíz sigue sin confirmarse (probablemente resolución de instancia con nombre vía SQL Browser/UDP 1434, poco fiable sobre VPN), pero el reintento la absorbe.
- **Aplicar en**: Cualquier operación futura contra `legacyService` que dependa de una conexión larga o crítica; considerar el mismo patrón de reintento si se usa `legacyService` directamente fuera de este servicio.

---

## Gotchas

- [ ] `stock.quant.quantity` no es escribible directamente; hay que usar `inventory_quantity` + `action_apply_inventory()`. Verificar en Fase 2 la firma exacta del método vía JSON-2 (`/json/2/stock.quant/action_apply_inventory`) antes de generalizar.
- [ ] `3666` y `4514` quedan fuera de la carga automática hasta resolución manual en Odoo (ver Aprendizajes). No reactivar por script sin haber limpiado antes el duplicado de `3666`.
- [ ] Los 6 códigos "SOBRE VENTA..." (`4502`-`4507`) tienen `EXISTENCIA=9999` como valor centinela, no una cantidad real — exclusión permanente, no solo para esta carga.
- [ ] SQL Server solo es alcanzable desde la intranet local; esta acción no debe invocarse desde el entorno de Vercel (mismo límite que ya tiene el resto de `ImportWizard`).
- [ ] Los productos nuevos deben crearse con `default_code` numérico puro (sin `ART-`), igual que el catálogo existente, o `findRentalProduct`/la búsqueda por código quedará inconsistente con el resto.

## Anti-Patrones

- No leer artículos/existencias desde Supabase para esta carga.
- No crear productos con compañía asignada para los 43 nuevos (van sin compañía).
- No incluir los 6 códigos "SOBRE VENTA" bajo ningún concepto.
- No reactivar `3666`/`4514` de forma automática ni idéntica entre sí sin resolver antes el duplicado real de `3666`.
- No escribir `stock.quant.quantity` directamente.
- No hardcodear IDs de compañía, almacén o ubicación de stock.
- No aplicar el ajuste sin previsualización y confirmación explícita del usuario.

---

*PRP pendiente de aprobación. No se ha modificado código de producto.*
