import { tool } from 'ai'
import { z } from 'zod'
import { createAnonClient } from '@/lib/supabase/server'

// El generador de tipos de Supabase (database.types.ts) no trae el marcador
// que esta version de @supabase/supabase-js necesita para inferir selects
// con relaciones embebidas (customer:customers(...), items:rental_items(...))
// ni `.rpc()`: siempre caen a `never`. El resto del proyecto ya convive con
// esto tipando a mano en el punto de uso (ver reservationsService.ts); se
// sigue el mismo patron aqui en vez de pelear con el inferidor.

interface CustomerRef {
  name: string | null
  phone: string | null
  email?: string | null
  address?: string | null
  vat?: string | null
  is_internal: boolean | null
}

interface ArticleRef {
  code: string | null
  description: string
  family?: string | null
}

interface RentalItemRef {
  quantity: number
  notes?: string | null
  article_id?: string
  article: ArticleRef | null
}

interface WarehouseRef {
  name: string
  code?: string
}

interface RentalRow {
  id: string
  legacy_id: number | null
  event_date: string | null
  delivery_date: string
  pickup_date: string
  delivery_address: string | null
  notes: string | null
  status: string | null
  warehouse: WarehouseRef | null
  customer: CustomerRef | null
  items: RentalItemRef[]
}

interface ArticleReservationRow {
  reservation_date: string
  rental_id: string
  rental_legacy_id: number | null
  customer_name: string
  quantity: number
  delivery_date: string
  pickup_date: string
  delivery_address: string | null
  event_date: string
}

interface StockBreakageRow {
  article_id: string
  article_code: string | null
  article_description: string
  article_family: string | null
  breakage_date: string
  total_stock: number
  committed: number
  available: number
  stock_sevilla: number
  stock_jerez: number
}

async function callRpc<T>(
  supabase: ReturnType<typeof createAnonClient>,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  return (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: T[] | null; error: { message: string } | null }> }).rpc(fn, args)
}

// -----------------------------------------------------------------------
// queryTable: consulta flexible de solo lectura para razonamiento ad hoc
// (preguntas "que pasaria si" de logistica que no encajan en ninguna tool
// fija: mover una recogida para evitar una rotura, cruzar disponibilidad
// entre varios articulos, etc.). Deliberadamente NO es SQL crudo: tabla,
// columnas, relaciones embebidas y operadores estan en listas blancas, asi
// que no hay superficie de inyeccion y no puede tocar columnas/tablas fuera
// de esta lista aunque el modelo lo intente. El calculo/razonamiento sobre
// los datos crudos lo hace el propio modelo en varias llamadas encadenadas,
// no esta tool.
// -----------------------------------------------------------------------

const QUERYABLE_TABLES = ['rentals', 'rental_items', 'articles', 'customers', 'article_stock', 'warehouses'] as const
type QueryableTable = (typeof QUERYABLE_TABLES)[number]

const TABLE_COLUMNS: Record<QueryableTable, readonly string[]> = {
  rentals: ['id', 'legacy_id', 'customer_id', 'warehouse_id', 'event_date', 'delivery_date', 'pickup_date', 'delivery_address', 'notes', 'status'],
  rental_items: ['id', 'rental_id', 'article_id', 'quantity', 'notes'],
  articles: ['id', 'legacy_id', 'code', 'description', 'family', 'is_active'],
  customers: ['id', 'legacy_id', 'name', 'phone', 'email', 'address', 'vat', 'is_internal'],
  article_stock: ['id', 'article_id', 'warehouse_id', 'quantity'],
  warehouses: ['id', 'code', 'name'],
}

// Relaciones embebidas permitidas por tabla: clave = nombre que usa el
// modelo, valor = fragmento real de select() de supabase-js. Fijas a mano
// (no generadas desde el nombre) para que no se puedan pedir columnas fuera
// de esta lista via el embed.
const TABLE_EMBEDS: Record<QueryableTable, Record<string, string>> = {
  rentals: {
    customer: 'customer:customers(name, phone, email, is_internal)',
    warehouse: 'warehouse:warehouses(name, code)',
    items: 'items:rental_items(quantity, article_id, notes, article:articles(code, description, family))',
  },
  rental_items: {
    article: 'article:articles(code, description, family)',
    rental: 'rental:rentals(legacy_id, event_date, delivery_date, pickup_date, status, customer:customers(name, is_internal))',
  },
  article_stock: {
    article: 'article:articles(code, description, family)',
    warehouse: 'warehouse:warehouses(name, code)',
  },
  articles: {},
  customers: {},
  warehouses: {},
}

const FILTER_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like', 'ilike', 'is'] as const
type FilterOperator = (typeof FILTER_OPERATORS)[number]

const DEFAULT_QUERY_LIMIT = 200
const MAX_QUERY_LIMIT = 1000

interface QueryFilter {
  column: string
  operator: FilterOperator
  value: string | number | boolean | Array<string | number>
}

// Quita filas cuyo cliente embebido sea interno, sin que el modelo tenga
// que acordarse de pedirlo: es la misma regla de negocio que ya aplican a
// mano el resto de tools sobre `rentals`, aqui se fuerza en el propio
// backstop de seguridad en vez de confiar en el prompt.
function stripInternalCustomers(rows: Array<Record<string, unknown>>): { rows: Array<Record<string, unknown>>; excluded: number } {
  let excluded = 0
  const filtered = rows.filter((row) => {
    const customer = row.customer as { is_internal?: boolean } | undefined
    const rental = row.rental as { customer?: { is_internal?: boolean } } | undefined
    const isInternal = customer?.is_internal === true || rental?.customer?.is_internal === true
    if (isInternal) excluded++
    return !isInternal
  })
  return { rows: filtered, excluded }
}

const queryTable = tool({
  description: `Consulta de solo lectura de grano fino sobre una tabla de Supabase, para razonar sobre preguntas de logistica que las demas tools no cubren directamente (ej. "si adelanto la recogida de tal pedido, se resuelve la rotura de tal fecha", cruces de disponibilidad entre varios articulos/almacenes, o cualquier analisis ad hoc). No hace agregaciones (SUM/COUNT): trae filas y razona sobre ellas tu mismo en varios pasos.

Tablas y columnas disponibles:
- rentals: id, legacy_id, customer_id, warehouse_id, event_date, delivery_date, pickup_date, delivery_address, notes, status. Embeds: customer, warehouse, items.
- rental_items: id, rental_id, article_id, quantity, notes. Embeds: article, rental.
- articles: id, legacy_id, code, description, family, is_active.
- customers: id, legacy_id, name, phone, email, address, vat, is_internal.
- article_stock: id, article_id, warehouse_id, quantity. Embeds: article, warehouse.
- warehouses: id, code, name.

Las filas de "rentals"/"rental_items" cuyo cliente (directo o via el embed "rental") sea interno (traspaso Sevilla<->Jerez) se excluyen SIEMPRE automaticamente si pides el embed "customer"/"rental" — pidelo si vas a listar pedidos para no perder esa proteccion.`,
  inputSchema: z.object({
    table: z.enum(QUERYABLE_TABLES).describe('Tabla a consultar'),
    columns: z.array(z.string()).min(1).describe('Columnas planas de esa tabla a devolver (de la lista permitida en la descripcion)'),
    embeds: z.array(z.string()).optional().describe('Nombres de relaciones a incluir (de la lista permitida en la descripcion para esa tabla)'),
    filters: z.array(z.object({
      column: z.string().describe('Columna plana de la tabla sobre la que filtrar'),
      operator: z.enum(FILTER_OPERATORS),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).describe('Para "in" usa un array; para el resto, un valor simple'),
    })).optional().describe('Condiciones AND a aplicar'),
    orderBy: z.object({
      column: z.string(),
      ascending: z.boolean().optional(),
    }).optional(),
    limit: z.number().optional().describe(`Maximo de filas a devolver, por defecto ${DEFAULT_QUERY_LIMIT}, tope duro ${MAX_QUERY_LIMIT}. Si el resultado viene truncado, acota mas con filters en vez de pedir mas limit.`),
  }),
  execute: async ({ table, columns, embeds, filters, orderBy, limit }) => {
    const allowedColumns = TABLE_COLUMNS[table as QueryableTable]
    const allowedEmbeds = TABLE_EMBEDS[table as QueryableTable]

    const badColumns = columns.filter((c) => !allowedColumns.includes(c))
    if (badColumns.length > 0) {
      return { error: `Columnas no permitidas para "${table}": ${badColumns.join(', ')}. Columnas validas: ${allowedColumns.join(', ')}` }
    }

    const embedFragments: string[] = []
    for (const embedName of embeds ?? []) {
      const fragment = allowedEmbeds[embedName]
      if (!fragment) {
        return { error: `Embed "${embedName}" no valido para "${table}". Embeds validos: ${Object.keys(allowedEmbeds).join(', ') || '(ninguno)'}` }
      }
      embedFragments.push(fragment)
    }

    for (const f of filters ?? []) {
      if (!allowedColumns.includes(f.column)) {
        return { error: `No se puede filtrar por "${f.column}" en "${table}". Solo se admite filtrar por columnas planas: ${allowedColumns.join(', ')}` }
      }
    }

    if (orderBy && !allowedColumns.includes(orderBy.column)) {
      return { error: `No se puede ordenar por "${orderBy.column}" en "${table}". Columnas validas: ${allowedColumns.join(', ')}` }
    }

    const effectiveLimit = Math.min(limit && limit > 0 ? limit : DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT)
    const selectClause = [...columns, ...embedFragments].join(', ')

    const supabase = createAnonClient()
    let query = supabase.from(table as QueryableTable).select(selectClause).limit(effectiveLimit + 1)

    for (const f of filters ?? []) {
      query = (query as unknown as Record<FilterOperator, (col: string, val: unknown) => typeof query>)[f.operator](f.column, f.value)
    }
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true }) as typeof query
    }

    const { data, error } = await query

    if (error) return { error: error.message }

    const rawRows = (data as unknown as Array<Record<string, unknown>>) ?? []
    const truncated = rawRows.length > effectiveLimit
    const pageRows = truncated ? rawRows.slice(0, effectiveLimit) : rawRows

    const { rows, excluded } = stripInternalCustomers(pageRows)

    return {
      rows,
      rowCount: rows.length,
      internalCustomersExcluded: excluded || undefined,
      truncated: truncated || undefined,
      note: truncated
        ? `Hay mas filas de las devueltas (limite ${effectiveLimit}). Acota mas con "filters" (fechas, ids, etc.) en vez de subir "limit".`
        : undefined,
    }
  },
})

// La API REST de Supabase acota un select() sin range() a un maximo de filas
// (verificado en este proyecto: 3000; es configuracion de proyecto, no un
// estandar fijo — no asumir el numero sin comprobarlo). Con >2 años de
// historico ya importado, cualquier consulta de rango amplio (todo un año o
// mas) puede superarlo y truncarse en silencio sin dar error. Se pagina
// siempre en bloques de 1000 para que el resultado sea correcto sin importar
// el tamaño del rango.
const PAGE_SIZE = 1000

type RentalRangeRow = {
  id: string
  event_date: string | null
  customer_id: string
  customer: { name: string | null; is_internal: boolean | null } | null
  items: Array<{ quantity: number; article_id: string; article: { code: string | null; description: string } | null }>
}

async function fetchAllRentalsInRange(
  supabase: ReturnType<typeof createAnonClient>,
  startDate: string,
  endDate: string,
  select: string,
): Promise<RentalRangeRow[]> {
  const rows: RentalRangeRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('rentals')
      .select(select)
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .neq('status', 'cancelled')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const page = (data as unknown as RentalRangeRow[]) ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}

export const chatTools = {
  queryTable,

  searchArticles: tool({
    description: 'Busca articulos por nombre, codigo o familia. Usa esto primero para encontrar el ID de un articulo antes de consultar disponibilidad.',
    inputSchema: z.object({
      query: z.string().describe('Texto de busqueda (nombre, codigo o familia del articulo)'),
    }),
    execute: async ({ query }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('articles')
        .select('id, code, description, family')
        .or(`description.ilike.%${query}%,code.ilike.%${query}%,family.ilike.%${query}%`)
        .eq('is_active', true)
        .limit(20)

      if (error) return { error: error.message }
      return { articles: data, count: data?.length ?? 0 }
    },
  }),

  searchCustomers: tool({
    description: 'Busca clientes reales por nombre, email o telefono. Excluye automaticamente los prestamos internos entre almacenes (Sevilla<->Jerez), que no son clientes.',
    inputSchema: z.object({
      query: z.string().describe('Texto de busqueda (nombre, email o telefono del cliente)'),
    }),
    execute: async ({ query }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, email, address, vat')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
        .eq('is_internal', false)
        .limit(20)

      if (error) return { error: error.message }
      return { customers: data, count: data?.length ?? 0 }
    },
  }),

  searchRentalByContract: tool({
    description: 'Busca un pedido/reserva por su numero de contrato del sistema antiguo (legacy_id). Usa esto cuando el usuario mencione un numero de contrato o folio (ej. "contrato 41252760").',
    inputSchema: z.object({
      contractNumber: z.number().describe('Numero de contrato del sistema antiguo (legacy_id)'),
    }),
    execute: async ({ contractNumber }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('rentals')
        .select(
          'id, legacy_id, event_date, delivery_date, pickup_date, delivery_address, notes, status, warehouse:warehouses(name, code), customer:customers(name, phone, email, vat), items:rental_items(quantity, notes, article:articles(code, description, family))',
        )
        .eq('legacy_id', contractNumber)
        .maybeSingle()

      if (error) return { error: error.message }
      if (!data) return { found: false, message: `No se encontro ningun contrato con numero ${contractNumber}` }
      return { found: true, rental: data as unknown as RentalRow }
    },
  }),

  getCustomerRentalHistory: tool({
    description: 'Obtiene el historial de pedidos/reservas de un cliente concreto. Usa searchCustomers primero para obtener el customerId si solo tienes el nombre.',
    inputSchema: z.object({
      customerId: z.string().describe('ID del cliente (UUID). Usa searchCustomers primero si solo tienes el nombre.'),
      startDate: z.string().optional().describe('Fecha inicio en formato YYYY-MM-DD (opcional)'),
      endDate: z.string().optional().describe('Fecha fin en formato YYYY-MM-DD (opcional)'),
    }),
    execute: async ({ customerId, startDate, endDate }) => {
      const supabase = createAnonClient()
      let query = supabase
        .from('rentals')
        .select(
          'id, legacy_id, event_date, delivery_date, pickup_date, delivery_address, status, warehouse:warehouses(name), items:rental_items(quantity, article:articles(code, description))',
        )
        .eq('customer_id', customerId)
        .order('event_date', { ascending: false })
        .limit(30)

      if (startDate) query = query.gte('event_date', startDate)
      if (endDate) query = query.lte('event_date', endDate)

      const { data, error } = await query

      if (error) return { error: error.message }
      return { rentals: data, count: data?.length ?? 0 }
    },
  }),

  checkAvailability: tool({
    description: 'Consulta la disponibilidad de un articulo en una fecha o rango. Retorna stock total, comprometido y disponible. Si available es negativo, hay rotura de stock.',
    inputSchema: z.object({
      articleId: z.string().describe('ID del articulo (UUID). Usa searchArticles primero si solo tienes el nombre.'),
      startDate: z.string().describe('Fecha inicio en formato YYYY-MM-DD'),
      endDate: z.string().optional().describe('Fecha fin del rango (opcional, si no se indica se usa startDate)'),
    }),
    execute: async ({ articleId, startDate, endDate }) => {
      const supabase = createAnonClient()
      const { data, error } = await callRpc<ArticleReservationRow>(supabase, 'get_article_reservations_optimized', {
        p_article_id: articleId,
        start_date: startDate,
        end_date: endDate ?? startDate,
      })

      if (error) return { error: error.message }

      // Also get total stock for context
      const { data: stockDataRaw } = await supabase
        .from('article_stock')
        .select('quantity, warehouse:warehouses(name)')
        .eq('article_id', articleId)
      const stockData = stockDataRaw as unknown as Array<{ quantity: number; warehouse: WarehouseRef | null }> | null

      const { data: article } = await supabase
        .from('articles')
        .select('description, code')
        .eq('id', articleId)
        .single()

      const totalStock = (stockData ?? []).reduce((sum, s) => sum + s.quantity, 0)

      // Group reservations by date to show daily committed
      const byDate = new Map<string, { committed: number; reservations: Array<{ customer: string; quantity: number }> }>()

      for (const r of data ?? []) {
        const existing = byDate.get(r.reservation_date)
        if (!existing) {
          byDate.set(r.reservation_date, {
            committed: r.quantity,
            reservations: [{ customer: r.customer_name, quantity: r.quantity }],
          })
        } else {
          existing.committed += r.quantity
          existing.reservations.push({ customer: r.customer_name, quantity: r.quantity })
        }
      }

      const dailyAvailability = Array.from(byDate.entries()).map(([date, info]) => ({
        date,
        totalStock,
        committed: info.committed,
        available: totalStock - info.committed,
        reservations: info.reservations,
      }))

      return {
        article: article ?? { description: 'Desconocido' },
        totalStock,
        stockByWarehouse: stockData,
        dailyAvailability,
        daysWithBreakage: dailyAvailability.filter(d => d.available < 0).length,
      }
    },
  }),

  getStockBreakages: tool({
    description: 'Obtiene todas las roturas de stock (articulos con disponibilidad negativa) en un rango de fechas. Usa esto para ver que articulos faltan.',
    inputSchema: z.object({
      startDate: z.string().describe('Fecha inicio en formato YYYY-MM-DD'),
      endDate: z.string().describe('Fecha fin en formato YYYY-MM-DD'),
    }),
    execute: async ({ startDate, endDate }) => {
      const supabase = createAnonClient()
      const { data, error } = await callRpc<StockBreakageRow>(supabase, 'get_stock_breakages_optimized', {
        start_date: startDate,
        end_date: endDate,
      })

      if (error) return { error: error.message }

      // Group by article for summary
      const grouped = new Map<string, {
        code: string | null
        description: string
        totalStock: number
        maxDeficit: number
        stockSevilla: number
        stockJerez: number
        breakageDays: number
        firstDate: string
        lastDate: string
      }>()

      for (const b of data ?? []) {
        const existing = grouped.get(b.article_id)
        if (!existing) {
          grouped.set(b.article_id, {
            code: b.article_code,
            description: b.article_description,
            totalStock: b.total_stock,
            maxDeficit: Math.abs(b.available),
            stockSevilla: b.stock_sevilla,
            stockJerez: b.stock_jerez,
            breakageDays: 1,
            firstDate: b.breakage_date,
            lastDate: b.breakage_date,
          })
        } else {
          if (Math.abs(b.available) > existing.maxDeficit) {
            existing.maxDeficit = Math.abs(b.available)
          }
          existing.breakageDays++
          if (b.breakage_date > existing.lastDate) existing.lastDate = b.breakage_date
          if (b.breakage_date < existing.firstDate) existing.firstDate = b.breakage_date
        }
      }

      return {
        totalBreakages: data?.length ?? 0,
        articlesAffected: grouped.size,
        articles: Array.from(grouped.values()).sort((a, b) => b.maxDeficit - a.maxDeficit),
      }
    },
  }),

  getArticleReservations: tool({
    description: 'Obtiene las reservas detalladas de un articulo especifico en un rango de fechas. Muestra quien lo tiene reservado, cuanto y cuando.',
    inputSchema: z.object({
      articleId: z.string().describe('ID del articulo (UUID)'),
      startDate: z.string().describe('Fecha inicio en formato YYYY-MM-DD'),
      endDate: z.string().describe('Fecha fin en formato YYYY-MM-DD'),
    }),
    execute: async ({ articleId, startDate, endDate }) => {
      const supabase = createAnonClient()
      const { data, error } = await callRpc<ArticleReservationRow>(supabase, 'get_article_reservations_optimized', {
        p_article_id: articleId,
        start_date: startDate,
        end_date: endDate,
      })

      if (error) return { error: error.message }
      return { reservations: data, count: data?.length ?? 0 }
    },
  }),

  getRentalsByDate: tool({
    description: 'Obtiene los eventos/reservas programados para una fecha especifica (por event_date). Incluye almacen, cliente y cantidad de articulos. Excluye prestamos internos entre almacenes.',
    inputSchema: z.object({
      date: z.string().describe('Fecha del evento en formato YYYY-MM-DD'),
    }),
    execute: async ({ date }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('rentals')
        .select(
          'id, legacy_id, event_date, delivery_date, pickup_date, delivery_address, notes, status, warehouse:warehouses(name), customer:customers(name, phone, is_internal), items:rental_items(quantity, article:articles(code, description))',
        )
        .eq('event_date', date)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (error) return { error: error.message }
      const rentals = ((data as unknown as RentalRow[]) ?? []).filter((r) => !r.customer?.is_internal)
      return { rentals, count: rentals.length }
    },
  }),

  getDeliveriesByDate: tool({
    description: 'Obtiene las entregas de material programadas para una fecha especifica (por delivery_date). Incluye direcciones de entrega. Excluye prestamos internos entre almacenes.',
    inputSchema: z.object({
      date: z.string().describe('Fecha de entrega en formato YYYY-MM-DD'),
    }),
    execute: async ({ date }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('rentals')
        .select(
          'id, legacy_id, event_date, delivery_date, delivery_address, notes, warehouse:warehouses(name), customer:customers(name, phone, address, is_internal)',
        )
        .eq('delivery_date', date)
        .neq('status', 'cancelled')
        .order('delivery_address')

      if (error) return { error: error.message }
      const deliveries = ((data as unknown as RentalRow[]) ?? []).filter((r) => !r.customer?.is_internal)
      return { deliveries, count: deliveries.length }
    },
  }),

  getPickupsByDate: tool({
    description: 'Obtiene las recogidas de material programadas para una fecha especifica (por pickup_date). Excluye prestamos internos entre almacenes.',
    inputSchema: z.object({
      date: z.string().describe('Fecha de recogida en formato YYYY-MM-DD'),
    }),
    execute: async ({ date }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('rentals')
        .select(
          'id, legacy_id, event_date, pickup_date, delivery_address, notes, warehouse:warehouses(name), customer:customers(name, phone, is_internal)',
        )
        .eq('pickup_date', date)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (error) return { error: error.message }
      const pickups = ((data as unknown as RentalRow[]) ?? []).filter((r) => !r.customer?.is_internal)
      return { pickups, count: pickups.length }
    },
  }),

  getDemandForecast: tool({
    description: 'Obtiene la prevision de demanda: cuantos eventos hay por semana en un rango de fechas. Util para planificar carga de trabajo.',
    inputSchema: z.object({
      startDate: z.string().describe('Fecha inicio en formato YYYY-MM-DD'),
      endDate: z.string().describe('Fecha fin en formato YYYY-MM-DD'),
    }),
    execute: async ({ startDate, endDate }) => {
      const supabase = createAnonClient()
      let allRows: RentalRangeRow[]
      try {
        allRows = await fetchAllRentalsInRange(supabase, startDate, endDate, 'id, event_date, customer:customers(name, is_internal)')
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Error desconocido' }
      }

      const rentals = allRows.filter((r) => !r.customer?.is_internal && r.event_date)

      // Group by week
      const weeks = new Map<string, number>()
      for (const rental of rentals) {
        const date = new Date(rental.event_date as string)
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay() + 1) // Monday
        const weekKey = weekStart.toISOString().split('T')[0]
        weeks.set(weekKey, (weeks.get(weekKey) ?? 0) + 1)
      }

      const forecast = Array.from(weeks.entries())
        .map(([weekStart, eventCount]) => ({ weekStart, eventCount }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))

      return {
        totalEvents: rentals.length,
        weeks: forecast,
        peakWeek: forecast.reduce((max, w) => w.eventCount > max.eventCount ? w : max, { weekStart: '', eventCount: 0 }),
      }
    },
  }),

  getPurchaseNeeds: tool({
    description: 'Calcula las necesidades de compra: que material necesito comprar para cubrir el deficit en un rango de fechas. Muestra articulo, deficit maximo y cuanto comprar.',
    inputSchema: z.object({
      startDate: z.string().describe('Fecha inicio en formato YYYY-MM-DD'),
      endDate: z.string().describe('Fecha fin en formato YYYY-MM-DD'),
    }),
    execute: async ({ startDate, endDate }) => {
      const supabase = createAnonClient()
      const { data, error } = await callRpc<StockBreakageRow>(supabase, 'get_stock_breakages_optimized', {
        start_date: startDate,
        end_date: endDate,
      })

      if (error) return { error: error.message }

      // For each article, find the maximum deficit (worst day)
      const needs = new Map<string, {
        code: string | null
        description: string
        family: string | null
        totalStock: number
        maxCommitted: number
        maxDeficit: number
        needToBuy: number
      }>()

      for (const b of data ?? []) {
        const deficit = Math.abs(b.available)
        const existing = needs.get(b.article_id)
        if (!existing || deficit > existing.maxDeficit) {
          needs.set(b.article_id, {
            code: b.article_code,
            description: b.article_description,
            family: b.article_family ?? null,
            totalStock: b.total_stock,
            maxCommitted: b.committed,
            maxDeficit: deficit,
            needToBuy: deficit,
          })
        }
      }

      const purchaseList = Array.from(needs.values()).sort((a, b) => b.needToBuy - a.needToBuy)

      return {
        articlesWithDeficit: purchaseList.length,
        totalUnitsToBuy: purchaseList.reduce((sum, p) => sum + p.needToBuy, 0),
        purchaseList,
      }
    },
  }),

  getMostReservedArticles: tool({
    description: 'Obtiene el ranking de articulos mas reservados (por cantidad total) en un rango de fechas, de mayor a menor. Usa esto para preguntas como "que articulo se reserva mas", "articulos mas populares" o "top articulos" en un periodo.',
    inputSchema: z.object({
      startDate: z.string().describe('Fecha inicio en formato YYYY-MM-DD'),
      endDate: z.string().describe('Fecha fin en formato YYYY-MM-DD'),
      limit: z.number().optional().describe('Cuantos articulos devolver en el ranking, por defecto 10'),
    }),
    execute: async ({ startDate, endDate, limit = 10 }) => {
      const supabase = createAnonClient()
      let rentals: RentalRangeRow[]
      try {
        rentals = await fetchAllRentalsInRange(
          supabase, startDate, endDate,
          'id, customer:customers(is_internal), items:rental_items(quantity, article_id, article:articles(code, description))',
        )
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Error desconocido' }
      }

      const totals = new Map<string, {
        code: string | null
        description: string
        totalQuantity: number
        reservationCount: number
      }>()

      for (const rental of rentals.filter((r) => !r.customer?.is_internal)) {
        for (const item of rental.items ?? []) {
          const existing = totals.get(item.article_id)
          if (!existing) {
            totals.set(item.article_id, {
              code: item.article?.code ?? null,
              description: item.article?.description ?? 'Desconocido',
              totalQuantity: item.quantity,
              reservationCount: 1,
            })
          } else {
            existing.totalQuantity += item.quantity
            existing.reservationCount++
          }
        }
      }

      const ranking = Array.from(totals.values())
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, limit)

      return {
        totalArticlesDistinct: totals.size,
        ranking,
      }
    },
  }),

  getTopCustomers: tool({
    description: 'Obtiene el ranking de clientes con mas pedidos/eventos (por numero de reservas) en un rango de fechas, de mayor a menor. Usa esto para preguntas como "que cliente tiene mas pedidos", "ranking de clientes", "cliente mas frecuente" o "quien nos compra mas". Excluye automaticamente los prestamos internos entre almacenes.',
    inputSchema: z.object({
      startDate: z.string().describe('Fecha inicio en formato YYYY-MM-DD'),
      endDate: z.string().describe('Fecha fin en formato YYYY-MM-DD'),
      limit: z.number().optional().describe('Cuantos clientes devolver en el ranking, por defecto 10'),
    }),
    execute: async ({ startDate, endDate, limit = 10 }) => {
      const supabase = createAnonClient()
      let rentals: RentalRangeRow[]
      try {
        rentals = await fetchAllRentalsInRange(supabase, startDate, endDate, 'id, customer_id, customer:customers(name, is_internal)')
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Error desconocido' }
      }

      const totals = new Map<string, { name: string; orderCount: number }>()

      for (const rental of rentals.filter((r) => !r.customer?.is_internal)) {
        const existing = totals.get(rental.customer_id)
        if (!existing) {
          totals.set(rental.customer_id, { name: rental.customer?.name ?? 'Desconocido', orderCount: 1 })
        } else {
          existing.orderCount++
        }
      }

      const ranking = Array.from(totals.values())
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, limit)

      return {
        totalCustomersDistinct: totals.size,
        ranking,
      }
    },
  }),
}
