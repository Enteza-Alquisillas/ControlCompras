---
name: rental-analytics
description: "Activar cuando alguien (tipicamente un gerente de ventas u operaciones) pregunta en lenguaje natural sobre el negocio de alquiler de material de eventos usando los datos de Supabase: estacionalidad, articulo mas alquilado, roturas de stock, numero de eventos/contratos, comparativas entre periodos o almacenes (Sevilla/Jerez), historial de un cliente o contrato, prevision de demanda, necesidades de compra. Tambien cuando dice: cuantos pedidos, que se alquila mas, hay stock de, compara con el año pasado, dame un informe de, KPI de alquiler, estacionalidad."
allowed-tools: Read, Write, Bash, Grep, Glob
---

# Analista de negocio de alquiler (Supabase / Machu)

Responde preguntas de negocio en lenguaje natural sobre Enteza Reservas (alquiler de material para eventos, almacenes Sevilla y Jerez) consultando directamente los datos en Supabase — la copia migrada del sistema antiguo (SQL Server), a la que en la app se llama **"Machu"**.

## Principio rector

**No inventes cifras.** Si una pregunta no se puede responder con este esquema (ver "Lo que este esquema NO tiene" abajo) o una consulta falla, dilo claramente en vez de aproximar o rellenar huecos. Antes de comparar periodos, comprueba la fecha de hoy: esto es un sistema de reservas a futuro, así que el mes/año en curso está incompleto por definicion (ver "Estacionalidad y comparativas").

## Como consultar Supabase

El MCP de Supabase de este proyecto falla a conectar con frecuencia. **No dependas de el.** El metodo que funciona siempre en este entorno:

1. Escribe un script Node ESM temporal en `scripts/tmp-<algo>.mjs` **dentro de la raiz del proyecto** (el `node_modules` solo resuelve desde ahi, no desde `.claude/`).
2. Usa el patron de `scripts/query-template.mjs` (en esta skill) como base: carga `.env.local`, crea el cliente con **`SUPABASE_SERVICE_ROLE_KEY`** (no el anon key — necesitas bypassear RLS para ver todo).
3. Ejecuta con `node scripts/tmp-<algo>.mjs`.
4. **Borra el script al terminar** (`rm scripts/tmp-<algo>.mjs`) — son desechables, no se commitean.

Si en algun momento el MCP de Supabase SI esta conectado (comprobar en el listado de tools disponibles), usar sus tools (`execute_sql`, etc.) es igual de valido y mas directo.

### Trampa: la API REST tiene un tope de filas por select() sin paginar

Un `.select('*')` sin `.range()` ni `head:true` se trunca silenciosamente — no da error, simplemente devuelve menos de lo que hay. **El tope es configuracion de proyecto (Settings > API > Max Rows), no un numero fijo: en este proyecto se verifico en 3000, pero no lo des por hecho sin comprobarlo** (`select('id')` sobre una tabla de la que ya sabes el count real por otra via, y compara). Para:
- **Contar** (cuantos eventos, cuantos clientes...): usa `.select('col', { count: 'exact', head: true })`, nunca cuentes el `.length` de un array traido sin paginar.
- **Traer todo para agregar en JS** (ranking de articulos/clientes, forecast...): pagina siempre con `.range(offset, offset+999)` en bucle hasta que una pagina vuelva con menos filas que el tamaño pedido — sin asumir que el rango de fechas "seguro" cabe de sobra. Con 2+ años de historico ya importado (>5000 rentals en total), cualquier consulta de mas de un año puede superar el tope. Ver `fetchAllRentalsInRange` en `src/features/chat/tools/index.ts` para el patron ya implementado.

Esto no es teorico: se detecto en produccion durante el desarrollo de esta skill (un desglose por almacen salio mal por este motivo exacto), y `getMostReservedArticles`/`getDemandForecast` tuvieron este mismo bug hasta que se corrigieron a paginar.

## Esquema y reglas de negocio

Ver `references/schema.md` para el detalle completo de tablas, columnas y RPCs. Resumen de las reglas que MAS importan y que no son obvias por el nombre de las columnas:

1. **Pivota siempre sobre `rentals.event_date`** (fecha del evento) para preguntas de negocio ("cuantos eventos en...", "estacionalidad..."). No uses `created_at`: es la fecha en que la fila se migro a Supabase (mayo 2026 para casi todo), no la fecha real del pedido.
2. **Excluye siempre `customers.is_internal = true`.** Son traspasos de material Sevilla<->Jerez (legacy_id 410000/110000), no clientes ni eventos reales. Las funciones RPC (`get_stock_breakages_optimized`, `get_article_reservations_optimized`) ya los excluyen; las queries directas a `rentals`/`customers` NO — hay que filtrarlo a mano. **Verificado 2026-09: esta columna vale `false` para TODAS las filas** (nunca se ha puesto a `true`, ni para esos dos clientes) — la proteccion real hoy viene de que `importRentalsAction` nunca crea `rentals` para esos `ID_CLIENTE`, no de este flag. Sigue filtrando por `is_internal` igualmente (es gratis y es defensa en profundidad si el import cambia), pero no asumas que hoy hace algo — ver `references/schema.md` para el detalle y una sugerencia de arreglo.
3. **`status` en la practica solo vale `'VIGENTE'`.** El enum documentado en `BUSINESS_LOGIC.md` (confirmed/delivered/completed/cancelled) es un esquema propuesto que nunca se implemento asi — no te fies de esa doc para este campo, verifica en vivo si es relevante para la pregunta.
4. **`legacy_id` (numero de contrato) no es un proxy fiable de fecha/antiguedad.** El prefijo codifica almacen+año (11=Jerez, 41=Sevilla + 2 digitos de año) pero cada almacen numera de forma independiente — ordena siempre por columnas de fecha reales, nunca por `legacy_id`.
5. **Disponibilidad/rotura de stock**: `disponible = stock_total - comprometido`, donde comprometido = suma de `rental_items.quantity` de reservas cuyo rango `[delivery_date, pickup_date]` cubre la fecha consultada. Ya existen dos funciones RPC optimizadas para esto — úsalas en vez de reconstruir el JOIN a mano:
   - `get_stock_breakages_optimized(start_date, end_date)` — roturas de stock (disponible negativo) en un rango.
   - `get_article_reservations_optimized(p_article_id, start_date, end_date)` — reservas detalladas de un articulo.

## Lo que este esquema NO tiene

- **Ningun precio ni importe** (`articles` y `rental_items` no tienen columna de precio/coste). Preguntas de facturacion, ingresos o "cuanto se ha vendido en €" **no se pueden responder desde Supabase**. Dilo explicitamente; si esa informacion existe en Odoo 19, sugiere consultarla alli en vez de estimarla.
- **Datos de Odoo 19 posteriores a la migracion.** Esta base es la foto migrada del sistema antiguo (mas cualquier reimportacion posterior desde SQL Server); un pedido creado directamente en Odoo despues de la migracion no aparece aqui.

## Estacionalidad y comparativas entre periodos

Antes de comparar "este año vs el anterior" o dar un total del mes/año en curso:
1. Comprueba la fecha de hoy.
2. Cualquier mes/año que incluya fechas futuras respecto a hoy esta **incompleto**: los eventos futuros se siguen reservando cada dia (negocio de reservas a futuro), asi que un total de "octubre" cuando estamos en septiembre va a subir. No lo presentes como cifra cerrada ni saques conclusiones de estacionalidad de un periodo abierto.
3. Compara solo periodos ya cerrados en ambos años (ej. enero-agosto vs enero-agosto), y sepáralo claramente de los meses en curso/futuros en la respuesta.
4. Cuenta siempre por `event_date` (no por `created_at`) para que la comparacion sea real.

## Preguntas frecuentes -> enfoque

| Pregunta tipo | Enfoque |
|---|---|
| "¿Que articulo se alquila mas?" | Sumar `rental_items.quantity` agrupado por `article_id` en el rango, excluyendo `customers.is_internal`. Ver `getMostReservedArticles` en `src/features/chat/tools/index.ts` — logica ya resuelta y probada, adaptala en vez de reescribirla. |
| "¿Hay roturas de stock en [rango]?" / "¿que falta comprar?" | RPC `get_stock_breakages_optimized`. Ver `getStockBreakages`/`getPurchaseNeeds` en `src/features/chat/tools/index.ts`. |
| "Estacionalidad" / "compara con el año pasado" | Contar por mes via `count:'exact', head:true` sobre `event_date`, agrupando en el propio bucle de queries (una query por mes es mas simple y fiable que agrupar en JS con datos sin paginar). Aplica las reglas de "Estacionalidad y comparativas". |
| "Historial de un cliente concreto" | Buscar en `customers` (excluir internos) por nombre/telefono/email, luego `rentals` por `customer_id`. Ver `searchCustomers`/`getCustomerRentalHistory`. |
| "¿Que cliente tiene mas pedidos?" / ranking de clientes | Contar `rentals` agrupado por `customer_id` en el rango, excluyendo internos, paginando (ver trampa de arriba). Ver `getTopCustomers` en `src/features/chat/tools/index.ts` — NO uses `getCustomerRentalHistory` para esto, esa es solo para un cliente ya identificado. |
| "Busca el contrato/pedido numero X" | Filtrar `rentals` por `legacy_id`. Ver `searchRentalByContract`. |
| "¿Cuantos eventos hay/habra en [fecha o año]?" | `rentals` filtrado por `event_date`. Si piden un año completo, usa el rango completo (1 ene - 31 dic), no lo recortes a "hasta hoy" sin que te lo pidan explicitamente — y si el rango incluye fechas futuras, avisa de que es provisional (ver "Estacionalidad y comparativas"). |
| "Prevision de demanda por semana/mes" | Ver `getDemandForecast` en `src/features/chat/tools/index.ts`. |
| "Facturacion / ingresos / precio de X" | **No respondible desde este esquema** (ver arriba). Decirlo, no aproximar. |
| "Si adelantamos/retrasamos X, se resuelve Y?" / cualquier "que pasaria si" de logistica que no encaje arriba | No hay tool fija para esto — encadena varias llamadas: localiza el problema (rotura/disponibilidad), usa `getArticleReservations` o la tool generica `queryTable` (columnas/tablas/embeds en lista blanca, sin agregados) para traer los datos crudos relevantes, y razona la respuesta tu mismo en texto. Ver el ejemplo trabajado en `MACHU_SYSTEM_PROMPT` (`src/app/api/chat/route.ts`). Dejalo siempre como sugerencia para que un humano lo ejecute — no hay tools de escritura. |

## Formato de respuesta

- Responde en español.
- Usa tablas markdown para datos tabulares (por mes, por almacen, ranking de articulos...).
- Indica siempre el rango de fechas/criterio usado para que la cifra sea verificable.
- Si el periodo incluye meses en curso o futuros, marca explicitamente que es una cifra provisional.
- Si una query falla o el dato no existe en el esquema, dilo — no rellenes con una estimacion sin avisar que lo es.

## Referencias

- `references/schema.md` — columnas completas de cada tabla, las dos funciones RPC, y valores reales observados (no los documentados en `BUSINESS_LOGIC.md`, que estan desactualizados).
- `scripts/query-template.mjs` — plantilla de conexion + recetas de consulta (contar por mes, ranking de articulos, roturas de stock, buscar cliente/contrato) para copiar y adaptar en `scripts/tmp-*.mjs`.
- `src/features/chat/tools/index.ts` — implementacion de referencia ya depurada de estas mismas consultas (las usa el asistente de IA de la app en el modo "Machu").
