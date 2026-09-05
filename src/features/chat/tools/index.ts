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
