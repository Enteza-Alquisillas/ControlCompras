// Plantilla de consulta para la skill rental-analytics.
//
// COMO USAR: copia lo que necesites a un archivo NUEVO en scripts/tmp-<algo>.mjs
// dentro de la raiz del proyecto (no se puede ejecutar desde .claude/, el
// node_modules no resuelve desde ahi), ajusta la consulta, ejecuta con
// `node scripts/tmp-<algo>.mjs`, y borra el archivo al terminar.
//
// Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// (service role, no el anon key, para saltarte RLS y ver todos los datos).

process.loadEnvFile('.env.local')
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ---------------------------------------------------------------------------
// RECETA 1: Contar eventos por mes (para estacionalidad/comparativas).
// OJO: una query por mes con count:'exact', head:true. NO uses .select('*')
// y cuentes el array en JS: la API REST trunca a 1000 filas sin avisar.
// ---------------------------------------------------------------------------
async function countEventsByMonth(year) {
  const counts = []
  for (let month = 1; month <= 12; month++) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = new Date(year, month, 0).toISOString().slice(0, 10) // ultimo dia del mes
    const { count, error } = await supabase
      .from('rentals')
      .select('id', { count: 'exact', head: true })
      .gte('event_date', start)
      .lte('event_date', end)
    if (error) throw new Error(`[${year}-${month}] ${error.message}`)
    counts.push({ month, count })
  }
  return counts
}

// ---------------------------------------------------------------------------
// RECETA 2: Ranking de articulos mas alquilados en un rango (excluye internos).
// Si el rango es grande, pagina con .range() en vez de traer todo de golpe.
// ---------------------------------------------------------------------------
async function topArticles(startDate, endDate, limit = 10) {
  const { data, error } = await supabase
    .from('rentals')
    .select('id, customer:customers(is_internal), items:rental_items(quantity, article_id, article:articles(code, description))')
    .gte('event_date', startDate)
    .lte('event_date', endDate)

  if (error) throw new Error(error.message)

  const totals = new Map()
  for (const rental of (data ?? []).filter((r) => !r.customer?.is_internal)) {
    for (const item of rental.items ?? []) {
      const existing = totals.get(item.article_id)
      if (!existing) {
        totals.set(item.article_id, {
          code: item.article?.code ?? null,
          description: item.article?.description ?? 'Desconocido',
          totalQuantity: item.quantity,
        })
      } else {
        existing.totalQuantity += item.quantity
      }
    }
  }

  return Array.from(totals.values()).sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, limit)
}

// ---------------------------------------------------------------------------
// RECETA 3: Roturas de stock en un rango (usa la funcion RPC, no reconstruyas el JOIN).
// ---------------------------------------------------------------------------
async function stockBreakages(startDate, endDate) {
  const { data, error } = await supabase.rpc('get_stock_breakages_optimized', {
    start_date: startDate,
    end_date: endDate,
  })
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------------------
// RECETA 4: Buscar un contrato/pedido por numero (legacy_id).
// ---------------------------------------------------------------------------
async function findRentalByContract(contractNumber) {
  const { data, error } = await supabase
    .from('rentals')
    .select('id, legacy_id, event_date, delivery_date, pickup_date, status, warehouse:warehouses(name), customer:customers(name, phone), items:rental_items(quantity, article:articles(code, description))')
    .eq('legacy_id', contractNumber)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------------------
// RECETA 5: Buscar un cliente real (excluye traspasos internos) y su historial.
// ---------------------------------------------------------------------------
async function customerHistory(nameQuery) {
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('id, name, phone, email')
    .ilike('name', `%${nameQuery}%`)
    .eq('is_internal', false)
    .limit(5)
  if (custError) throw new Error(custError.message)
  if (!customers?.length) return []

  const results = []
  for (const c of customers) {
    const { data: rentals, error } = await supabase
      .from('rentals')
      .select('legacy_id, event_date, delivery_date, pickup_date, status')
      .eq('customer_id', c.id)
      .order('event_date', { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    results.push({ customer: c, rentals })
  }
  return results
}

// --- Ejemplo de uso: descomenta y ajusta segun la pregunta a responder ---
// console.log(await countEventsByMonth(2026))
// console.log(await topArticles('2026-01-01', '2026-12-31'))
// console.log(await stockBreakages('2026-09-01', '2026-09-30'))
// console.log(await findRentalByContract(41253392))
// console.log(await customerHistory('BAJOPLATO'))
