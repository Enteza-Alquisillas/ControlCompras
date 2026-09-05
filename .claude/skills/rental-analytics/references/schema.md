# Esquema real de Supabase (verificado, no el propuesto en BUSINESS_LOGIC.md)

Fuente de verdad: `src/lib/supabase/database.types.ts` (tipos generados) + verificacion en vivo contra la base de datos durante el desarrollo de esta skill. Si algo aqui no cuadra con lo que ves, confia en una consulta en vivo antes que en este documento — la ultima verificacion fue 2026-09.

## Tablas

### `articles` — catalogo de material
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `legacy_id` | int | id en el sistema antiguo (`ID_MATERIAL`) |
| `code` | text | formato `ART-<legacy_id>` |
| `description` | text | |
| `family` | text | categoria (ej. MANTELERIAS, SILLAS, VAJILLAS, CRISTALERIAS) |
| `is_active` | bool | filtra artículos dados de baja (`BAJA=1` en origen) |

### `customers` — clientes
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `legacy_id` | int | `ID_CLIENTE` en origen |
| `name`, `phone`, `email`, `address` | text | |
| `vat` | text | NIF/CIF normalizado (sin prefijo "ES") |
| `is_internal` | bool | **true = traspaso de material entre almacenes, NO es un cliente real.** legacy_id conocidos: 410000 (Sevilla->Jerez), 110000 (Jerez->Sevilla). Excluir siempre de conteos de clientes/eventos reales. |

### `rentals` — cabecera de pedido/evento ("contrato")
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `legacy_id` | int | numero de contrato del sistema antiguo (`ID_EVENTO`). Prefijo = almacen+año (ej. `4125xxxx` = Sevilla, contrato de 2025; `1126xxxx` = Jerez, 2026) pero **no ordenar por esto**, cada almacen numera independiente |
| `customer_id` | uuid FK -> customers | |
| `warehouse_id` | uuid FK -> warehouses | |
| `event_date` | date | **fecha pivote de negocio** — el dia del evento. Usar esta columna para casi cualquier pregunta de "cuantos eventos en..." |
| `delivery_date` | date | fecha de entrega de material (puede ser antes del evento) |
| `pickup_date` | date | fecha de recogida (puede ser despues del evento) |
| `delivery_address` | text | |
| `notes` | text | |
| `status` | text | **en la practica, siempre `'VIGENTE'`** en los datos reales (verificado: 2432+ filas, un unico valor). El enum `confirmed/delivered/completed/cancelled` de BUSINESS_LOGIC.md es un diseño que no se implemento asi. No filtrar por ese enum sin comprobar antes. |
| `created_at` | timestamptz | **fecha de alta de la fila en Supabase (migracion), NO la fecha real del pedido.** Para lotes migrados masivamente, decenas de miles de filas comparten el mismo `created_at` (el momento del import). Nunca usar para preguntas de negocio. |
| `odoo_order_id`, `odoo19_order_id`, `odoo19_company_code`, `odoo_synced_at`, `odoo19_synced_at` | — | vinculo con la exportacion a Odoo, no relevante para analitica de Machu |

### `rental_items` — lineas de detalle
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `rental_id` | uuid FK -> rentals | |
| `article_id` | uuid FK -> articles | |
| `quantity` | int | unidades reservadas de ese articulo en ese pedido |
| `notes` | text | |

**No hay precio ni importe en ninguna columna de `articles` ni `rental_items`.** No se puede calcular facturacion/ingresos desde este esquema.

### `article_stock` — stock por almacen
| Columna | Tipo | Notas |
|---|---|---|
| `article_id` | uuid FK | |
| `warehouse_id` | uuid FK | |
| `quantity` | int | stock actual (foto del momento del ultimo import de articulos, no historico) |

Constraint unica: `(article_id, warehouse_id)` — un import de articulos hace upsert sobre esto, no duplica.

### `warehouses`
| Columna | Notas |
|---|---|
| `code` | `'SEVILLA'` o `'JEREZ'` |
| `name` | |

Solo hay 2 filas.

## Funciones RPC ya optimizadas

Estas dos funciones (en `supabase-migrations/optimized-functions.sql`) ya implementan correctamente la exclusion de clientes internos y el calculo de disponibilidad por rango — **prefierelas siempre** frente a reconstruir el JOIN a mano:

### `get_stock_breakages_optimized(start_date DATE, end_date DATE)`
Devuelve, por cada dia de evento dentro del rango, los articulos cuya disponibilidad (`stock_total - comprometido`) es negativa. Columnas: `article_id, article_code, article_description, article_family, breakage_date, total_stock, committed, available, event_day_committed, stock_sevilla, stock_jerez`.

### `get_article_reservations_optimized(p_article_id UUID, start_date DATE, end_date DATE)`
Devuelve una fila por cada dia dentro del rango de entrega-recogida de cada reserva de ese articulo (generate_series entre `delivery_date` y `pickup_date`, acotado al rango pedido). Columnas: `reservation_date, rental_id, rental_legacy_id, customer_name, quantity, delivery_date, pickup_date, delivery_address, event_date`.

Llamada desde `@supabase/supabase-js` (usa `Database['public']['Functions']['<nombre>']['Returns'][number]` para tipar el resultado, o castea manualmente — la inferencia automatica de `.rpc()` no funciona bien en este proyecto con la version instalada de supabase-js, ver comentario al inicio de `src/features/chat/tools/index.ts`):

```ts
const { data, error } = await supabase.rpc('get_stock_breakages_optimized', {
  start_date: '2026-01-01',
  end_date: '2026-01-31',
})
```

## Volumen de datos (referencia, medido 2026-09-06 tras importar historico desde 2025-01-01)

| Tabla | Filas aprox. |
|---|---|
| `rentals` | ~5.500 |
| `rental_items` | ~175.000 |
| `customers` | ~4.200 |
| `articles` | ~1.100 |
| `article_stock` | ~1.150 |

Tamaño total en disco: bajo (bastante por debajo del limite de 500MB del plan free de Supabase). El cuello de botella de una consulta grande es de **filas devueltas por la API REST** (limite de 1000 sin paginar), no de tamaño de la base.
