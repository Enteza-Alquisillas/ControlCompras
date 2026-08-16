import { tool } from 'ai'
import { z } from 'zod'
import { createAnonClient } from '@/lib/supabase/server'

// Type helper for RPC calls on the Supabase client
interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => { range: (from: number, to: number) => Promise<{ data: unknown; error: { message: string } | null }> } & Promise<{ data: unknown; error: { message: string } | null }>
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
    description: 'Busca clientes por nombre, email o telefono.',
    inputSchema: z.object({
      query: z.string().describe('Texto de busqueda (nombre, email o telefono del cliente)'),
    }),
    execute: async ({ query }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, email, address')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
        .limit(20)

      if (error) return { error: error.message }
      return { customers: data, count: data?.length ?? 0 }
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
      const rpc = supabase as unknown as RpcClient
      const { data, error } = await rpc.rpc('get_article_reservations_optimized', {
        p_article_id: articleId,
        start_date: startDate,
        end_date: endDate ?? startDate,
      })

      if (error) return { error: error.message }

      // Also get total stock for context
      const { data: stockData } = await supabase
        .from('article_stock')
        .select('quantity, warehouse:warehouses(name)')
        .eq('article_id', articleId)

      const { data: article } = await supabase
        .from('articles')
        .select('description, code')
        .eq('id', articleId)
        .single()

      const totalStock = (stockData as Array<{ quantity: number }>)?.reduce((sum, s) => sum + s.quantity, 0) ?? 0

      // Group reservations by date to show daily committed
      const reservations = data as Array<{ reservation_date: string; quantity: number; customer_name: string; rental_id: string }> | null
      const byDate = new Map<string, { committed: number; reservations: Array<{ customer: string; quantity: number }> }>()

      for (const r of reservations ?? []) {
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
      const rpc = supabase as unknown as RpcClient
      const { data, error } = await rpc.rpc('get_stock_breakages_optimized', {
        start_date: startDate,
        end_date: endDate,
      })

      if (error) return { error: error.message }

      const breakages = data as Array<{
        article_id: string
        article_code: string | null
        article_description: string
        breakage_date: string
        total_stock: number
        committed: number
        available: number
        stock_sevilla: number
        stock_jerez: number
      }> | null

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

      for (const b of breakages ?? []) {
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
        totalBreakages: breakages?.length ?? 0,
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
      const rpc = supabase as unknown as RpcClient
      const { data, error } = await rpc.rpc('get_article_reservations_optimized', {
        p_article_id: articleId,
        start_date: startDate,
        end_date: endDate,
      })

      if (error) return { error: error.message }
      return { reservations: data, count: (data as Array<unknown>)?.length ?? 0 }
    },
  }),

  getRentalsByDate: tool({
    description: 'Obtiene los eventos/reservas programados para una fecha especifica (por event_date). Incluye nombre del cliente y cantidad de articulos.',
    inputSchema: z.object({
      date: z.string().describe('Fecha del evento en formato YYYY-MM-DD'),
    }),
    execute: async ({ date }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('rentals')
        .select('id, legacy_id, event_date, delivery_date, pickup_date, delivery_address, notes, status, customer:customers(name, phone), items:rental_items(quantity, article:articles(code, description))')
        .eq('event_date', date)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (error) return { error: error.message }
      return { rentals: data, count: data?.length ?? 0 }
    },
  }),

  getDeliveriesByDate: tool({
    description: 'Obtiene las entregas de material programadas para una fecha especifica (por delivery_date). Incluye direcciones de entrega.',
    inputSchema: z.object({
      date: z.string().describe('Fecha de entrega en formato YYYY-MM-DD'),
    }),
    execute: async ({ date }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('rentals')
        .select('id, legacy_id, event_date, delivery_date, delivery_address, notes, customer:customers(name, phone, address)')
        .eq('delivery_date', date)
        .neq('status', 'cancelled')
        .order('delivery_address')

      if (error) return { error: error.message }
      return { deliveries: data, count: data?.length ?? 0 }
    },
  }),

  getPickupsByDate: tool({
    description: 'Obtiene las recogidas de material programadas para una fecha especifica (por pickup_date).',
    inputSchema: z.object({
      date: z.string().describe('Fecha de recogida en formato YYYY-MM-DD'),
    }),
    execute: async ({ date }) => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('rentals')
        .select('id, legacy_id, event_date, pickup_date, delivery_address, notes, customer:customers(name, phone)')
        .eq('pickup_date', date)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (error) return { error: error.message }
      return { pickups: data, count: data?.length ?? 0 }
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
      const { data, error } = await supabase
        .from('rentals')
        .select('event_date, delivery_date, pickup_date')
        .not('event_date', 'is', null)
        .gte('event_date', startDate)
        .lte('event_date', endDate)
        .neq('status', 'cancelled')

      if (error) return { error: error.message }

      // Group by week
      const weeks = new Map<string, number>()
      const rentals = data as Array<{ event_date: string; delivery_date: string; pickup_date: string }>
      for (const rental of rentals ?? []) {
        const date = new Date(rental.event_date)
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay() + 1) // Monday
        const weekKey = weekStart.toISOString().split('T')[0]
        weeks.set(weekKey, (weeks.get(weekKey) ?? 0) + 1)
      }

      const forecast = Array.from(weeks.entries())
        .map(([weekStart, eventCount]) => ({ weekStart, eventCount }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))

      return {
        totalEvents: rentals?.length ?? 0,
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
      const rpc = supabase as unknown as RpcClient
      const { data, error } = await rpc.rpc('get_stock_breakages_optimized', {
        start_date: startDate,
        end_date: endDate,
      })

      if (error) return { error: error.message }

      const breakages = data as Array<{
        article_id: string
        article_code: string | null
        article_description: string
        article_family: string | null
        total_stock: number
        committed: number
        available: number
      }> | null

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

      for (const b of breakages ?? []) {
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
      const { data, error } = await supabase
        .from('rentals')
        .select('id, items:rental_items(quantity, article_id, article:articles(code, description))')
        .gte('event_date', startDate)
        .lte('event_date', endDate)
        .neq('status', 'cancelled')

      if (error) return { error: error.message }

      type RentalWithItems = {
        items: Array<{
          quantity: number
          article_id: string
          article: { code: string | null; description: string } | null
        }>
      }

      const totals = new Map<string, {
        code: string | null
        description: string
        totalQuantity: number
        reservationCount: number
      }>()

      for (const rental of (data as RentalWithItems[]) ?? []) {
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
}
