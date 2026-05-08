# PRP-ODOO-001: Exportación de Pedidos de Alquiler a Odoo 15 Community

> **Estado:** PLANIFICADO
> **Prioridad:** ALTA
> **Estimación:** 4 fases / ~2-3 días de implementación
> **Creado:** 2026-05-08

---

## 1. OBJETIVO

Añadir una nueva sección en la app **Enteza Reservas** que permita:

1. Seleccionar un rango de fechas para listar pedidos de alquiler (`rentals`)
2. Visualizar y seleccionar los pedidos a exportar
3. Lanzar la creación de esos pedidos como `sale.order` en **Odoo 15 Community**

El resultado son pedidos de venta en Odoo con:
- Cabecera: cliente, fecha evento, dirección, notas
- Líneas: artículos + cantidades de cada `rental_items`

---

## 2. CONTEXTO DEL PROYECTO

### Stack actual
- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + RLS)
- **Patrones:** Feature-first (`src/features/`), Server Actions para lógica de negocio
- **Auth:** Supabase Email/Password (ya implementado)
- **Estado global:** Zustand
- **Validación:** Zod

### Modelo de datos relevante en Supabase

```
rentals
  id UUID PK
  legacy_id INTEGER           ← ID en SQL Server original
  customer_id UUID FK→customers
  delivery_date DATE          ← Fecha de entrega al cliente
  pickup_date DATE            ← Fecha de recogida
  event_date DATE             ← Fecha del evento (pivot de UI)
  delivery_address TEXT
  notes TEXT
  status TEXT                 ← 'confirmed' | 'delivered' | 'completed' | 'cancelled'
  odoo_order_id INTEGER       ← [NUEVO] ID del sale.order en Odoo (null = no exportado)
  odoo_synced_at TIMESTAMPTZ  ← [NUEVO] Timestamp de última exportación a Odoo

rental_items
  id UUID PK
  rental_id UUID FK→rentals
  article_id UUID FK→articles
  quantity INTEGER

articles
  id UUID PK
  legacy_id INTEGER
  code TEXT                   ← Referencia interna (se usará para buscar en Odoo)
  description TEXT
  family TEXT

customers
  id UUID PK
  legacy_id INTEGER
  name TEXT
  email TEXT
  phone TEXT
  address TEXT
```

### Rutas de navegación existentes
- `/dashboard` — Disponibilidad de stock
- `/reservations` — Calendario de reservas
- `/chat` — Asistente IA
- `/import` — Sincronización manual

### Patrón de Server Actions existente
Ver `src/features/import/actions/importActions.ts` como referencia de cómo implementar Server Actions con Supabase admin client y manejo de errores tipado.

---

## 3. API DE ODOO 15 COMMUNITY

### Protocolo
Odoo 15 Community expone una **API JSON-RPC 2.0** en los siguientes endpoints:

| Endpoint | Uso |
|----------|-----|
| `POST /web/session/authenticate` | Autenticación, obtiene `session_id` y `uid` |
| `POST /web/dataset/call_kw` | CRUD sobre cualquier modelo de Odoo |

> **Nota:** También existe XML-RPC en `/xmlrpc/2/common` y `/xmlrpc/2/object`, pero JSON-RPC es más sencillo para Next.js. Se usará JSON-RPC.

### Autenticación
```http
POST http://{ODOO_URL}/web/session/authenticate
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "call",
  "id": 1,
  "params": {
    "db": "{ODOO_DB}",
    "login": "{ODOO_USER}",
    "password": "{ODOO_PASSWORD}"
  }
}
```
Respuesta: `{ result: { uid: 2, session_id: "xxx...", ... } }`

La cookie de sesión (`session_id`) debe enviarse en todas las llamadas posteriores como header `Cookie: session_id=xxx`.

### Crear un sale.order
```http
POST http://{ODOO_URL}/web/dataset/call_kw
Cookie: session_id={SESSION_ID}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "call",
  "id": 2,
  "params": {
    "model": "sale.order",
    "method": "create",
    "args": [{
      "partner_id": 123,
      "date_order": "2026-05-10 00:00:00",
      "commitment_date": "2026-05-10 00:00:00",
      "note": "Notas del pedido",
      "order_line": [
        [0, 0, {
          "product_id": 456,
          "product_uom_qty": 10,
          "name": "Silla plegable blanca",
          "price_unit": 0
        }]
      ]
    }],
    "kwargs": {}
  }
}
```
Respuesta: `{ result: 789 }` (ID del sale.order creado)

### Buscar un partner (cliente) por nombre
```http
{
  "params": {
    "model": "res.partner",
    "method": "search_read",
    "args": [[["name", "ilike", "NOMBRE_CLIENTE"]]],
    "kwargs": {
      "fields": ["id", "name", "email"],
      "limit": 5
    }
  }
}
```

### Buscar un producto por referencia interna
```http
{
  "params": {
    "model": "product.product",
    "method": "search_read",
    "args": [[["default_code", "=", "ART-12345"]]],
    "kwargs": {
      "fields": ["id", "name", "default_code"],
      "limit": 1
    }
  }
}
```

### Variables de entorno necesarias
```
ODOO_URL=http://odoo.enteza.com:8069
ODOO_DB=enteza_prod
ODOO_USER=api_user@enteza.com
ODOO_PASSWORD=secret_password
```

---

## 4. ARQUITECTURA DE LA SOLUCIÓN

### Nueva feature: `src/features/odoo/`

```
src/features/odoo/
├── components/
│   ├── OdooExportPage.tsx          # Página principal (layout + estado)
│   ├── DateRangeSelector.tsx       # Selector de fechas inicio/fin
│   ├── RentalsSelectionTable.tsx   # Tabla de rentals con checkboxes
│   ├── RentalRowPreview.tsx        # Fila individual de rental
│   ├── ExportSummaryPanel.tsx      # Panel lateral: seleccionados + botón exportar
│   └── ExportResultModal.tsx       # Modal resultado: OK/errores por pedido
├── actions/
│   └── odooExportActions.ts        # Server Actions: exportar pedidos a Odoo
├── services/
│   ├── odooClient.ts               # Cliente JSON-RPC de bajo nivel
│   ├── odooSaleOrderService.ts     # Lógica: crear sale.order en Odoo
│   └── rentalsExportService.ts     # Lógica: leer rentals de Supabase para exportar
├── hooks/
│   ├── useRentalsForExport.ts      # Hook: cargar rentals por rango de fechas
│   └── useOdooExport.ts            # Hook: manejar proceso de exportación
├── types/
│   └── index.ts                    # Tipos TypeScript específicos de esta feature
└── index.ts                        # Exports públicos
```

### Nueva ruta: `/odoo-export`
```
src/app/(main)/odoo-export/
└── page.tsx                        # Server Component que renderiza OdooExportPage
```

### Cambio en Sidebar
Añadir nuevo ítem en `src/app/(main)/components/Sidebar.tsx`:
```typescript
{ href: '/odoo-export', label: 'Exportar a Odoo', icon: CloudArrowUpIcon }
```

---

## 5. TIPOS TYPESCRIPT

```typescript
// src/features/odoo/types/index.ts

// Estado de exportación de un rental
export type OdooExportStatus = 
  | 'pending'      // No exportado aún
  | 'exported'     // Ya exportado (odoo_order_id != null)
  | 'selected'     // Seleccionado para exportar en esta sesión
  | 'exporting'    // En proceso de exportación
  | 'success'      // Exportado correctamente en esta sesión
  | 'error'        // Error en la exportación

// Rental enriquecido para la tabla de exportación
export interface RentalForExport {
  id: string
  legacy_id: number | null
  event_date: string
  delivery_date: string
  pickup_date: string
  delivery_address: string | null
  notes: string | null
  status: string
  odoo_order_id: number | null
  odoo_synced_at: string | null
  customer: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
  items: {
    id: string
    quantity: number
    article: {
      id: string
      code: string
      description: string
    } | null
  }[]
  itemCount: number  // computed: items.length
}

// Payload que se envía al Server Action
export interface OdooExportPayload {
  rentalIds: string[]
}

// Resultado individual por rental
export interface OdooExportResult {
  rentalId: string
  rentalLegacyId: number | null
  customerName: string
  success: boolean
  odooOrderId?: number
  error?: string
}

// Resultado agregado de la exportación
export interface OdooExportBatchResult {
  total: number
  successful: number
  failed: number
  results: OdooExportResult[]
}

// Respuesta del cliente JSON-RPC de Odoo
export interface OdooRpcResponse<T = unknown> {
  jsonrpc: string
  id: number
  result?: T
  error?: {
    code: number
    message: string
    data: {
      name: string
      debug: string
      message: string
    }
  }
}

// Sesión de Odoo
export interface OdooSession {
  uid: number
  sessionId: string  // Cookie value
}

// Producto encontrado en Odoo
export interface OdooProduct {
  id: number
  name: string
  default_code: string
}

// Partner encontrado en Odoo
export interface OdooPartner {
  id: number
  name: string
  email: string | false
}
```

---

## 6. IMPLEMENTACIÓN POR FASES

---

### FASE 1: Migración de Base de Datos

**Objetivo:** Añadir campos `odoo_order_id` y `odoo_synced_at` a la tabla `rentals`.

**Migración SQL** (aplicar via Supabase MCP `apply_migration`):

```sql
-- Migration: add_odoo_fields_to_rentals
ALTER TABLE public.rentals
  ADD COLUMN IF NOT EXISTS odoo_order_id INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS odoo_synced_at TIMESTAMPTZ DEFAULT NULL;

-- Índice para consultar fácilmente qué ya fue exportado
CREATE INDEX IF NOT EXISTS idx_rentals_odoo_order_id 
  ON public.rentals (odoo_order_id) 
  WHERE odoo_order_id IS NOT NULL;

-- Comentarios para documentación
COMMENT ON COLUMN public.rentals.odoo_order_id IS 'ID del sale.order en Odoo 15. NULL = no exportado.';
COMMENT ON COLUMN public.rentals.odoo_synced_at IS 'Timestamp de la última exportación exitosa a Odoo.';
```

**Regenerar tipos TypeScript:**
```bash
# Usar Supabase MCP: generate_typescript_types
# Guardar en src/lib/supabase/database.types.ts
```

---

### FASE 2: Servicios Backend (Odoo Client + Server Actions)

#### 2.1 Cliente JSON-RPC de Odoo (`odooClient.ts`)

```typescript
// src/features/odoo/services/odooClient.ts

interface OdooClientConfig {
  url: string
  db: string
  user: string
  password: string
}

export class OdooClient {
  private config: OdooClientConfig
  private session: OdooSession | null = null
  private requestId = 0

  constructor(config: OdooClientConfig) {
    this.config = config
  }

  private nextId(): number {
    return ++this.requestId
  }

  async authenticate(): Promise<OdooSession> {
    const response = await fetch(`${this.config.url}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        id: this.nextId(),
        params: {
          db: this.config.db,
          login: this.config.user,
          password: this.config.password,
        },
      }),
    })

    const data: OdooRpcResponse<{ uid: number; session_id: string }> = await response.json()
    
    if (data.error) {
      throw new Error(`Odoo auth error: ${data.error.data.message}`)
    }
    if (!data.result?.uid) {
      throw new Error('Odoo auth failed: invalid credentials')
    }

    // Extraer session_id de la cookie Set-Cookie
    const setCookieHeader = response.headers.get('set-cookie') ?? ''
    const sessionMatch = setCookieHeader.match(/session_id=([^;]+)/)
    const sessionId = sessionMatch?.[1] ?? data.result.session_id

    this.session = { uid: data.result.uid, sessionId }
    return this.session
  }

  async callKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.session) {
      await this.authenticate()
    }

    const response = await fetch(`${this.config.url}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_id=${this.session!.sessionId}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        id: this.nextId(),
        params: { model, method, args, kwargs },
      }),
    })

    const data: OdooRpcResponse<T> = await response.json()

    if (data.error) {
      throw new Error(`Odoo RPC error [${model}.${method}]: ${data.error.data.message}`)
    }

    return data.result as T
  }

  // Buscar registros
  async searchRead<T>(
    model: string,
    domain: unknown[][],
    fields: string[],
    limit = 100
  ): Promise<T[]> {
    return this.callKw<T[]>(model, 'search_read', [domain], { fields, limit })
  }

  // Crear registro
  async create(model: string, values: Record<string, unknown>): Promise<number> {
    return this.callKw<number>(model, 'create', [values])
  }

  // Escribir en registro existente
  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return this.callKw<boolean>(model, 'write', [ids, values])
  }
}

// Singleton por request (para Server Actions)
export function createOdooClient(): OdooClient {
  const url = process.env.ODOO_URL
  const db = process.env.ODOO_DB
  const user = process.env.ODOO_USER
  const password = process.env.ODOO_PASSWORD

  if (!url || !db || !user || !password) {
    throw new Error('Odoo env vars not configured: ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD')
  }

  return new OdooClient({ url, db, user, password })
}
```

#### 2.2 Servicio de Sale Orders (`odooSaleOrderService.ts`)

```typescript
// src/features/odoo/services/odooSaleOrderService.ts

export class OdooSaleOrderService {
  constructor(private client: OdooClient) {}

  // Buscar o crear partner por nombre
  async findOrCreatePartner(name: string, email?: string): Promise<number> {
    const results = await this.client.searchRead<OdooPartner>(
      'res.partner',
      [['name', '=', name]],
      ['id', 'name', 'email'],
      1
    )

    if (results.length > 0) {
      return results[0].id
    }

    // Crear partner si no existe
    return this.client.create('res.partner', {
      name,
      email: email ?? false,
      customer_rank: 1,
    })
  }

  // Buscar producto por código interno (article.code en Supabase = default_code en Odoo)
  async findProductByCode(code: string): Promise<number | null> {
    const results = await this.client.searchRead<OdooProduct>(
      'product.product',
      [['default_code', '=', code]],
      ['id', 'name', 'default_code'],
      1
    )
    return results.length > 0 ? results[0].id : null
  }

  // Crear sale.order completo
  async createSaleOrder(rental: RentalForExport): Promise<number> {
    const customerName = rental.customer?.name ?? 'Cliente desconocido'
    const partnerId = await this.findOrCreatePartner(
      customerName,
      rental.customer?.email ?? undefined
    )

    // Construir líneas del pedido (many2many command [0, 0, values] = create)
    const orderLines: [0, 0, Record<string, unknown>][] = []

    for (const item of rental.items) {
      if (!item.article) continue

      const productId = await this.findProductByCode(item.article.code)

      const lineValues: Record<string, unknown> = {
        product_uom_qty: item.quantity,
        name: item.article.description,
        price_unit: 0,  // Precio 0 por defecto (es alquiler, precio se gestiona en Odoo)
      }

      if (productId) {
        lineValues.product_id = productId
      } else {
        // Si no existe el producto en Odoo, usar producto genérico o crear descripción manual
        lineValues.name = `[${item.article.code}] ${item.article.description}`
      }

      orderLines.push([0, 0, lineValues])
    }

    const eventDate = new Date(rental.event_date)
    const deliveryDate = new Date(rental.delivery_date)

    const orderId = await this.client.create('sale.order', {
      partner_id: partnerId,
      date_order: `${rental.event_date} 00:00:00`,
      commitment_date: `${rental.delivery_date} 00:00:00`,
      validity_date: rental.pickup_date,
      note: rental.notes ?? '',
      client_order_ref: rental.legacy_id ? `ENTEZA-${rental.legacy_id}` : undefined,
      // Dirección de entrega (como nota si no se mapea a partner_shipping_id)
      // Se puede añadir en note si no hay partner de entrega configurado
      order_line: orderLines,
    })

    return orderId
  }
}
```

#### 2.3 Servicio de lectura de Rentals (`rentalsExportService.ts`)

```typescript
// src/features/odoo/services/rentalsExportService.ts
// Lee rentals de Supabase enriquecidos con customer + items + articles

export async function getRentalsForExport(
  supabase: SupabaseClient,
  startDate: string,  // ISO date 'YYYY-MM-DD'
  endDate: string     // ISO date 'YYYY-MM-DD'
): Promise<RentalForExport[]> {
  const { data, error } = await supabase
    .from('rentals')
    .select(`
      id,
      legacy_id,
      event_date,
      delivery_date,
      pickup_date,
      delivery_address,
      notes,
      status,
      odoo_order_id,
      odoo_synced_at,
      customer:customers!customer_id (
        id, name, email, phone
      ),
      items:rental_items (
        id,
        quantity,
        article:articles!article_id (
          id, code, description
        )
      )
    `)
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true })
    .order('legacy_id', { ascending: true })

  if (error) throw new Error(`Error cargando rentals: ${error.message}`)

  return (data ?? []).map(rental => ({
    ...rental,
    customer: Array.isArray(rental.customer) ? rental.customer[0] ?? null : rental.customer,
    items: (rental.items ?? []).map(item => ({
      ...item,
      article: Array.isArray(item.article) ? item.article[0] ?? null : item.article,
    })),
    itemCount: rental.items?.length ?? 0,
  }))
}
```

#### 2.4 Server Action (`odooExportActions.ts`)

```typescript
// src/features/odoo/actions/odooExportActions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createOdooClient } from '../services/odooClient'
import { OdooSaleOrderService } from '../services/odooSaleOrderService'
import { getRentalsForExport } from '../services/rentalsExportService'

export async function exportRentalsToOdoo(
  payload: OdooExportPayload
): Promise<OdooExportBatchResult> {
  const supabase = await createClient()

  // Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  // Cargar datos completos de los rentals seleccionados
  const allRentals = await getRentalsForExport(supabase, '2000-01-01', '2099-12-31')
  const rentalsToExport = allRentals.filter(r => payload.rentalIds.includes(r.id))

  if (rentalsToExport.length === 0) {
    return { total: 0, successful: 0, failed: 0, results: [] }
  }

  // Inicializar cliente Odoo
  const odooClient = createOdooClient()
  await odooClient.authenticate()
  const saleOrderService = new OdooSaleOrderService(odooClient)

  const results: OdooExportResult[] = []

  for (const rental of rentalsToExport) {
    try {
      const odooOrderId = await saleOrderService.createSaleOrder(rental)

      // Actualizar rentals en Supabase con el ID de Odoo
      await supabase
        .from('rentals')
        .update({
          odoo_order_id: odooOrderId,
          odoo_synced_at: new Date().toISOString(),
        })
        .eq('id', rental.id)

      results.push({
        rentalId: rental.id,
        rentalLegacyId: rental.legacy_id,
        customerName: rental.customer?.name ?? 'Desconocido',
        success: true,
        odooOrderId,
      })
    } catch (error) {
      results.push({
        rentalId: rental.id,
        rentalLegacyId: rental.legacy_id,
        customerName: rental.customer?.name ?? 'Desconocido',
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      })
    }
  }

  return {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}
```

---

### FASE 3: Hooks de React

#### 3.1 `useRentalsForExport.ts`

```typescript
// Carga rentals de Supabase para el rango de fechas
// Devuelve: { rentals, isLoading, error, refetch }
// Usa createBrowserClient de Supabase
// Ejecuta query cuando cambian startDate o endDate
// Enriquece con customer + items + articles via select anidado
```

**Implementación completa:**
```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RentalForExport } from '../types'

interface UseRentalsForExportOptions {
  startDate: string  // 'YYYY-MM-DD'
  endDate: string    // 'YYYY-MM-DD'
}

interface UseRentalsForExportResult {
  rentals: RentalForExport[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useRentalsForExport({ startDate, endDate }: UseRentalsForExportOptions): UseRentalsForExportResult {
  const [rentals, setRentals] = useState<RentalForExport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    if (!startDate || !endDate) return
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: qErr } = await supabase
        .from('rentals')
        .select(`
          id, legacy_id, event_date, delivery_date, pickup_date,
          delivery_address, notes, status, odoo_order_id, odoo_synced_at,
          customer:customers!customer_id (id, name, email, phone),
          items:rental_items (
            id, quantity,
            article:articles!article_id (id, code, description)
          )
        `)
        .gte('event_date', startDate)
        .lte('event_date', endDate)
        .neq('status', 'cancelled')
        .order('event_date', { ascending: true })

      if (qErr) throw qErr

      const mapped: RentalForExport[] = (data ?? []).map(r => ({
        ...r,
        customer: Array.isArray(r.customer) ? r.customer[0] ?? null : r.customer,
        items: (r.items ?? []).map((it: any) => ({
          ...it,
          article: Array.isArray(it.article) ? it.article[0] ?? null : it.article,
        })),
        itemCount: r.items?.length ?? 0,
      }))

      setRentals(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando pedidos')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  return { rentals, isLoading, error, refetch: load }
}
```

#### 3.2 `useOdooExport.ts`

```typescript
// Gestiona el proceso de exportación
// Estado: selectedIds (Set<string>), isExporting, result (OdooExportBatchResult | null)
// Métodos: toggleSelect, selectAll, clearSelection, startExport
// Llama al Server Action exportRentalsToOdoo
// Actualiza el estado de los rentals localmente tras exportar

'use client'

import { useState, useCallback } from 'react'
import { exportRentalsToOdoo } from '../actions/odooExportActions'
import type { OdooExportBatchResult, RentalForExport } from '../types'

interface UseOdooExportResult {
  selectedIds: Set<string>
  isExporting: boolean
  exportResult: OdooExportBatchResult | null
  isResultModalOpen: boolean
  toggleSelect: (id: string) => void
  selectAll: (rentals: RentalForExport[]) => void
  clearSelection: () => void
  startExport: () => Promise<void>
  closeResultModal: () => void
}

export function useOdooExport(rentals: RentalForExport[], onSuccess: () => void): UseOdooExportResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState<OdooExportBatchResult | null>(null)
  const [isResultModalOpen, setIsResultModalOpen] = useState(false)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback((visibleRentals: RentalForExport[]) => {
    // Solo selecciona los no exportados aún
    const ids = visibleRentals
      .filter(r => r.odoo_order_id === null)
      .map(r => r.id)
    setSelectedIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const startExport = useCallback(async () => {
    if (selectedIds.size === 0) return
    setIsExporting(true)
    try {
      const result = await exportRentalsToOdoo({ rentalIds: Array.from(selectedIds) })
      setExportResult(result)
      setIsResultModalOpen(true)
      setSelectedIds(new Set())
      onSuccess()  // refetch para actualizar odoo_order_id en la tabla
    } catch (e) {
      setExportResult({
        total: 1,
        successful: 0,
        failed: 1,
        results: [{
          rentalId: '',
          rentalLegacyId: null,
          customerName: 'N/A',
          success: false,
          error: e instanceof Error ? e.message : 'Error de conexión con Odoo',
        }],
      })
      setIsResultModalOpen(true)
    } finally {
      setIsExporting(false)
    }
  }, [selectedIds, onSuccess])

  const closeResultModal = useCallback(() => {
    setIsResultModalOpen(false)
    setExportResult(null)
  }, [])

  return {
    selectedIds, isExporting, exportResult, isResultModalOpen,
    toggleSelect, selectAll, clearSelection, startExport, closeResultModal,
  }
}
```

---

### FASE 4: Componentes UI

#### 4.1 `OdooExportPage.tsx` — Componente raíz (Client Component)

```typescript
'use client'
// Layout principal de la feature:
//   - Header con título y descripción
//   - DateRangeSelector (fechas de filtro)
//   - Split layout: izquierda tabla, derecha panel de exportación
//   - ExportResultModal (se abre al terminar)
//
// Estado interno:
//   - startDate / endDate (default: inicio del mes actual → fin del mes actual)
//   - Conecta useRentalsForExport con useOdooExport
```

Estructura visual:
```
┌──────────────────────────────────────────────────────┐
│  Exportar a Odoo                                      │
│  Selecciona pedidos por rango de fechas               │
├──────────────────────────────────────────────────────┤
│  [Desde: ____] [Hasta: ____]  [Buscar]               │
├───────────────────────────────────┬──────────────────┤
│  TABLA DE PEDIDOS                 │ PANEL EXPORTAR   │
│  □ Fecha  Cliente  Items  Estado  │ X pedidos        │
│  ■ 15/05  García   5      Nuevo   │ seleccionados    │
│  □ 16/05  Pérez    3      Exportado│                 │
│  ■ 17/05  López    8      Nuevo   │ [Exportar        │
│  ...                              │  a Odoo]        │
│  [Sel. todos pendientes]          │                  │
└───────────────────────────────────┴──────────────────┘
```

#### 4.2 `RentalsSelectionTable.tsx`

Props: `rentals`, `selectedIds`, `isLoading`, `onToggle`, `onSelectAll`, `onClearAll`

Columnas:
| Columna | Datos | Notas |
|---------|-------|-------|
| Checkbox | Selección | Deshabilitado si `odoo_order_id != null` |
| Fecha Evento | `event_date` formateada | `DD/MM/YYYY` |
| Entrega | `delivery_date` | Más pequeño, secundario |
| Cliente | `customer.name` | Truncado a 30 chars |
| Artículos | `itemCount` items | Badge con número |
| Estado Odoo | `odoo_order_id` | Badge: "Pendiente" (gris) / "Exportado #123" (verde) |

Comportamiento:
- Filas exportadas (odoo_order_id != null): fondo verde tenue, checkbox deshabilitado
- Filas seleccionadas: fondo azul tenue
- Hover: fondo gris muy suave
- Loading: skeleton de 5 filas
- Empty: mensaje "No hay pedidos en el rango seleccionado"

#### 4.3 `ExportSummaryPanel.tsx`

Muestra:
- Contador de seleccionados ("X pedidos seleccionados")
- Lista de los seleccionados (nombre cliente + fecha, scrollable)
- Botón principal "Exportar a Odoo" (disabled si 0 seleccionados o isExporting)
- Spinner durante exportación
- Nota informativa: "Los pedidos ya exportados no pueden volver a exportarse"

#### 4.4 `ExportResultModal.tsx`

Modal post-exportación:
- Header: "Exportación completada" o "Exportación con errores"
- Stats: X exitosos / Y fallidos de Z total
- Lista scrollable de resultados:
  - ✅ ENTEZA-123 — García — Odoo #456
  - ❌ ENTEZA-124 — Pérez — Error: "res.partner not found..."
- Botón "Cerrar"
- Botón "Ver en Odoo" (si hay exitosos, abre `{ODOO_URL}/odoo/sales` en nueva pestaña)

#### 4.5 Página `/odoo-export/page.tsx`

```typescript
// src/app/(main)/odoo-export/page.tsx
import { OdooExportPage } from '@/features/odoo'

export default function OdooExportRoute() {
  return <OdooExportPage />
}
```

#### 4.6 Actualización del Sidebar

En `src/app/(main)/components/Sidebar.tsx`, añadir:
```typescript
{
  href: '/odoo-export',
  label: 'Exportar Odoo',
  icon: <ArrowUpOnSquareIcon className="w-5 h-5" />,  // Heroicons
  description: 'Crear pedidos en Odoo 15'
}
```

---

## 7. VARIABLES DE ENTORNO

### `.env.local` (Next.js app principal)
Añadir:
```
# Odoo 15 Community
ODOO_URL=http://odoo.enteza.com:8069
ODOO_DB=enteza_prod
ODOO_USER=api_user@enteza.com
ODOO_PASSWORD=secret_password
```

> **IMPORTANTE:** `ODOO_URL`, `ODOO_DB`, `ODOO_USER` y `ODOO_PASSWORD` son variables de servidor (sin prefijo `NEXT_PUBLIC_`). Nunca se exponen al cliente.

### `.env.example` — Actualizar con los nuevos campos
```
ODOO_URL=http://your-odoo-instance.com:8069
ODOO_DB=your_odoo_database
ODOO_USER=api_user@yourcompany.com
ODOO_PASSWORD=your_odoo_password
```

---

## 8. FLUJO COMPLETO (End-to-End)

```
Usuario abre /odoo-export
    │
    ├── Selecciona rango de fechas (ej: 01/06/2026 → 30/06/2026)
    │
    ├── App carga rentals de Supabase con customer + items
    │   (excluye status='cancelled')
    │
    ├── Tabla muestra pedidos:
    │   - Verde: ya exportados a Odoo (odoo_order_id != null)
    │   - Normal: pendientes de exportar
    │
    ├── Usuario marca checkboxes (solo pendientes)
    │
    ├── Usuario pulsa "Exportar a Odoo"
    │
    ├── Server Action ejecuta para cada rental seleccionado:
    │   1. Crea OdooClient → authenticate()
    │   2. Para cada rental:
    │      a. findOrCreatePartner(customer.name, customer.email)
    │      b. Para cada rental_item:
    │         - findProductByCode(article.code)
    │         - Construir línea de pedido
    │      c. createSaleOrder({partner_id, date_order, order_line, ...})
    │      d. UPDATE rentals SET odoo_order_id=X, odoo_synced_at=NOW()
    │
    └── Modal de resultado muestra OK/errores por pedido
```

---

## 9. CASOS EDGE Y MANEJO DE ERRORES

| Caso | Comportamiento |
|------|----------------|
| Rental ya exportado (odoo_order_id != null) | Checkbox deshabilitado, fila verde, no se puede re-exportar |
| Cliente no existe en Odoo | Se crea automáticamente con `customer_rank: 1` |
| Artículo no existe en Odoo (code no match) | Se añade línea con descripción manual `[CODE] Descripción` sin product_id |
| Error de conexión con Odoo | Error global en modal, ningún rental se marca como exportado |
| Error en un rental específico | Se registra en results[], los demás continúan |
| Odoo URL no configurada | Server Action lanza error inmediato, se muestra en modal |
| Sin rentals en el rango | Tabla vacía con mensaje descriptivo |
| Rango > 3 meses | Mostrar advertencia (performance), permitir continuar |

---

## 10. CONSIDERACIONES DE ODOO 15 COMMUNITY

### Módulos de Odoo requeridos
- `sale` — Para `sale.order` y `sale.order.line` (incluido en instalación base)
- `stock` — Para disponibilidad de producto (incluido en Community)

### Permisos del usuario API en Odoo
El usuario `ODOO_USER` debe tener:
- Rol: **Vendedor** o **Responsable de ventas**
- Acceso a: `sale.order`, `sale.order.line`, `res.partner`, `product.product`
- Recomendado: crear usuario técnico específico para la integración

### Campo `default_code` en Odoo
En Odoo, `product.product.default_code` es la referencia interna.
En Supabase, `articles.code` contiene el código (ej: `ART-12345`).
Para que la búsqueda funcione, los productos en Odoo **deben tener rellenado** el campo `Referencia Interna` igual al código de Supabase.

### Alquiler vs Venta en Odoo 15 Community
Odoo Community **no tiene módulo de alquiler** nativo (ese es Enterprise).
La estrategia es usar `sale.order` con:
- `price_unit: 0` por defecto (el equipo de Enteza ajustará precios en Odoo)
- `client_order_ref`: Referencia a `ENTEZA-{legacy_id}` para trazabilidad
- Las fechas `delivery_date` y `pickup_date` como notas internas o campos personalizados

### Línea temporal de exportación
Si se quieren exportar fechas de entrega/recogida de forma estructurada en Odoo, se deberán añadir campos personalizados (`x_delivery_date`, `x_pickup_date`) al `sale.order` mediante un módulo custom de Odoo. Esto está **fuera del scope de este PRP** pero se puede añadir en una iteración futura.

---

## 11. ORDEN DE IMPLEMENTACIÓN

```
FASE 1 (30 min)
├── Aplicar migración SQL (odoo_order_id, odoo_synced_at)
└── Regenerar database.types.ts

FASE 2 (2 h)
├── src/features/odoo/types/index.ts
├── src/features/odoo/services/odooClient.ts
├── src/features/odoo/services/odooSaleOrderService.ts
├── src/features/odoo/services/rentalsExportService.ts
├── src/features/odoo/actions/odooExportActions.ts
└── Añadir vars de entorno a .env.local y .env.example

FASE 3 (1 h)
├── src/features/odoo/hooks/useRentalsForExport.ts
├── src/features/odoo/hooks/useOdooExport.ts
└── src/features/odoo/index.ts (exports)

FASE 4 (2 h)
├── src/features/odoo/components/DateRangeSelector.tsx
├── src/features/odoo/components/RentalRowPreview.tsx
├── src/features/odoo/components/RentalsSelectionTable.tsx
├── src/features/odoo/components/ExportSummaryPanel.tsx
├── src/features/odoo/components/ExportResultModal.tsx
├── src/features/odoo/components/OdooExportPage.tsx
├── src/app/(main)/odoo-export/page.tsx
└── Actualizar Sidebar.tsx

VALIDACIÓN (30 min)
├── npm run typecheck
├── npm run build
└── Test manual con Odoo de desarrollo
```

---

## 12. VALIDACIÓN Y TESTING

### Checklist de aceptación
- [ ] La nueva opción "Exportar Odoo" aparece en el sidebar
- [ ] Se puede seleccionar un rango de fechas y ver los rentals
- [ ] Los rentals cancelados NO aparecen en la lista
- [ ] Los rentals ya exportados (odoo_order_id != null) se muestran en verde con badge "Exportado #X"
- [ ] Los checkboxes de rentals exportados están deshabilitados
- [ ] Se puede seleccionar múltiples rentals pendientes
- [ ] "Seleccionar todos pendientes" funciona correctamente
- [ ] Al exportar, se crean sale.orders en Odoo con partner y líneas correctas
- [ ] Los campos `odoo_order_id` y `odoo_synced_at` se actualizan en Supabase tras exportar
- [ ] El modal de resultado muestra OK/errores por rental
- [ ] Si un artículo no existe en Odoo, se crea la línea con descripción manual
- [ ] Si un cliente no existe en Odoo, se crea el partner automáticamente
- [ ] Las variables ODOO_* son solo de servidor (no aparecen en source del navegador)
- [ ] `npm run typecheck` pasa sin errores
- [ ] `npm run build` pasa sin errores

---

## 13. ARCHIVOS A CREAR / MODIFICAR

### Nuevos archivos
```
src/features/odoo/types/index.ts
src/features/odoo/services/odooClient.ts
src/features/odoo/services/odooSaleOrderService.ts
src/features/odoo/services/rentalsExportService.ts
src/features/odoo/actions/odooExportActions.ts
src/features/odoo/hooks/useRentalsForExport.ts
src/features/odoo/hooks/useOdooExport.ts
src/features/odoo/components/OdooExportPage.tsx
src/features/odoo/components/DateRangeSelector.tsx
src/features/odoo/components/RentalsSelectionTable.tsx
src/features/odoo/components/RentalRowPreview.tsx
src/features/odoo/components/ExportSummaryPanel.tsx
src/features/odoo/components/ExportResultModal.tsx
src/features/odoo/index.ts
src/app/(main)/odoo-export/page.tsx
```

### Archivos a modificar
```
src/app/(main)/components/Sidebar.tsx         → Añadir ítem "Exportar Odoo"
src/lib/supabase/database.types.ts            → Regenerar con nuevos campos
.env.local                                    → Añadir ODOO_* vars
.env.example                                  → Añadir ODOO_* vars (sin valores)
.claude/PROJECT_STATUS.md                     → Actualizar estado del proyecto
```

---

*PRP generado automáticamente. Aprobación requerida antes de implementar.*
*Próximo paso: Ejecutar BUCLE-AGENTICO con este PRP como blueprint.*
