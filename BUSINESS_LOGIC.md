# 📋 BUSINESS_LOGIC.md - Sistema de Gestión de Alquiler de Material para Eventos

> Generado por SaaS Factory | Fecha: 2026-01-23

---

## 1. Problema de Negocio

### Dolor
Empresa de alquiler de material para eventos (sillas, mesas, manteles, vajilla, etc.) con **alta rotación de productos** y reservas a futuro (varios meses de antelación). El sistema actual es una **aplicación antigua (PHP + SQL Server)** que necesita modernización.

El problema central es **calcular la disponibilidad real de artículos para una fecha futura**, considerando todas las reservas existentes que se solapan en el tiempo.

**Ejemplo del problema:**
- Stock total de sillas: 100 unidades
- Cliente A reserva 40 sillas del 1 al 5 de febrero
- Cliente B llama pidiendo 80 sillas para el 3 de febrero
- El sistema debe informar: "Solo hay 60 disponibles" (100 - 40 = 60)

### Costo Actual
- **Falta de fiabilidad**: Los datos no son precisos ni rápidos de obtener
- **Riesgo de sobreventa**: Comprometer más unidades de las disponibles sin detectarlo a tiempo
- **Planificación de compras ineficiente**: No saber cuántas unidades adicionales comprar para cumplir compromisos
- **Sistema legacy**: Aplicación PHP antigua, difícil de mantener y escalar

---

## 2. Solución

### Propuesta de Valor
> "Un sistema de reservas de alquiler que calcula disponibilidad a futuro en tiempo real para empresas de alquiler de material de eventos"

### Características Clave
1. **Cálculo de disponibilidad instantáneo** para cualquier fecha futura
2. **Detección de roturas de stock** (sobreventa) con alertas visuales
3. **Informes de disponibilidad por período** para planificar compras
4. **Multi-almacén** (Sevilla y Jerez) con inventario combinado
5. **Sobreventa informativa, no bloqueante** (el usuario decide si acepta)

---

## 3. Flujo Principal (Happy Path)

### Flujo de Consulta de Disponibilidad

```
1. Usuario accede al sistema
   ↓
2. Sistema carga y procesa todas las reservas activas
   ↓
3. Sistema calcula disponibilidad día a día hasta fin de año
   ↓
4. Muestra listado de artículos con rotura de stock
   - Ordenados por fecha de primera rotura
   - Indicador visual (rojo = problema)
   - Desglose por almacén (Sevilla/Jerez)
   ↓
5. Usuario hace clic en un artículo
   ↓
6. Sistema muestra detalle de reservas del artículo
   - Fecha de cada reserva
   - Unidades reservadas
   - Stock total vs. sobreventa acumulada
   ↓
7. Usuario identifica qué comprar o qué recoger antes
```

### Flujo de Creación de Reserva (Fase 2)

```
1. Cliente solicita material para fecha X
   ↓
2. Usuario crea pedido con fecha de entrega y recogida
   ↓
3. Al añadir artículos, sistema muestra disponibilidad en tiempo real
   - "100 sillas solicitadas - 60 disponibles - 40 en sobreventa"
   ↓
4. Usuario decide: aceptar 60 o forzar 100 (sobreventa consciente)
   ↓
5. Reserva queda registrada con alerta si hay sobreventa
```

---

## 4. Usuario Objetivo

### Perfil Principal
**Comerciales de oficina** que atienden pedidos por teléfono, fax o email.

### Características
- Varios usuarios trabajando simultáneamente
- Necesitan respuestas rápidas mientras atienden al cliente
- Deben identificar rápidamente si pueden aceptar un pedido
- También hay comerciales externos que traen pedidos para introducir después

### Permisos (MVP)
- Todos los usuarios tienen los mismos permisos
- Consultar disponibilidad y ver informes

---

## 5. Arquitectura de Datos

### Input (Datos de Entrada)

**Importación inicial desde sistema legacy:**
- Catálogo de artículos con stock por almacén
- Reservas existentes con fechas de entrega y recogida
- Clientes (datos básicos)

**Datos por reserva:**
| Campo | Descripción |
|-------|-------------|
| `id_evento` | ID único de la reserva |
| `id_cliente` | Cliente que reserva |
| `id_material` | Artículo reservado |
| `cantidad` | Unidades reservadas |
| `fecha_entrega` | Cuándo se entrega al cliente |
| `fecha_recogida` | Cuándo se recoge/devuelve |

### Output (Datos de Salida)

**Listado de Roturas de Stock:**
| Campo | Descripción |
|-------|-------------|
| Fecha | Primera fecha con rotura |
| Artículo | Nombre del producto |
| Ventas | Unidades comprometidas ese día |
| Existencias | Stock total |
| Falta | Déficit (negativo = sobreventa) |
| Stock Sevilla | Unidades en almacén Sevilla |
| Stock Jerez | Unidades en almacén Jerez |

**Detalle por Artículo:**
| Campo | Descripción |
|-------|-------------|
| Fecha | Fecha de cada reserva |
| Ventas | Unidades reservadas ese día |
| Existencias | Stock total del artículo |
| Sobreventa | Déficit acumulado |
| Cliente | Quién tiene la reserva (Fase 2) |

### Storage (Supabase - Esquema Propuesto)

```sql
-- Almacenes
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,        -- 'SEVILLA', 'JEREZ'
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Artículos
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id INTEGER,                 -- ID del sistema antiguo
  code TEXT UNIQUE,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Stock por almacén
CREATE TABLE article_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id),
  warehouse_id UUID REFERENCES warehouses(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(article_id, warehouse_id)
);

-- Clientes
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id INTEGER,                 -- ID del sistema antiguo
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  is_internal BOOLEAN DEFAULT false, -- true = préstamos entre almacenes
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Reservas/Eventos
CREATE TABLE rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id INTEGER,                 -- ID del sistema antiguo
  customer_id UUID REFERENCES customers(id),
  delivery_date DATE NOT NULL,       -- Fecha entrega al cliente
  pickup_date DATE NOT NULL,         -- Fecha recogida/devolución
  delivery_address TEXT,
  notes TEXT,
  status TEXT DEFAULT 'confirmed',   -- confirmed, delivered, completed, cancelled
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Lineas de reserva (articulos por reserva)
CREATE TABLE rental_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id UUID REFERENCES rentals(id) ON DELETE CASCADE,
  article_id UUID REFERENCES articles(id),
  quantity INTEGER NOT NULL,
  notes TEXT
);

-- Configuracion global del sistema
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Valores clave:
-- 'last_import_at' -> Timestamp de ultima sincronizacion exitosa (epoch)

-- Vista: Disponibilidad calculada (para consultas rapidas)
-- Se implementara como funcion o vista materializada
```

### Lógica de Cálculo de Disponibilidad

**Fórmula principal:**
```
Disponibilidad(artículo, fecha) = Stock_Total - Unidades_Comprometidas

Donde Unidades_Comprometidas = SUM(cantidad) de rental_items
  WHERE rental.delivery_date <= fecha
    AND rental.pickup_date >= fecha
    AND rental.status != 'cancelled'
    AND customer.is_internal = false  -- Excluir préstamos internos
```

**Clientes internos a excluir:**
- Préstamos Sevilla → Jerez (legacy_id: 410000)
- Préstamos Jerez → Sevilla (legacy_id: 110000)

---

## 6. KPI de Éxito

### Métrica Principal
> "Visualizar todas las roturas de stock previstas hasta fin de año en menos de 5 segundos"

### Criterios de Aceptación del MVP
- [ ] Importar reservas del sistema actual
- [ ] Mostrar listado de artículos con sobreventa, ordenados por fecha
- [ ] Poder hacer clic en un artículo y ver el detalle de sus reservas
- [ ] Mostrar stock desglosado por almacén (Sevilla/Jerez)
- [ ] Excluir automáticamente los préstamos internos entre almacenes
- [ ] Múltiples usuarios pueden consultar simultáneamente

---

## 7. Especificación Técnica

### Arquitectura de Features

```
src/features/
├── auth/                    # Autenticación Email/Password (Supabase)
│   ├── components/          # LoginForm, LogoutButton
│   ├── hooks/               # useAuth, useUser
│   └── services/            # authService
│
├── articles/                # Gestión de artículos
│   ├── components/          # ArticleList, ArticleCard
│   ├── hooks/               # useArticles
│   ├── services/            # articleService
│   └── types/               # Article, ArticleStock
│
├── inventory/               # Stock por almacén
│   ├── components/          # StockTable, WarehouseSelector
│   ├── hooks/               # useInventory
│   └── services/            # inventoryService
│
├── rentals/                 # Reservas de alquiler
│   ├── components/          # RentalList, RentalDetail
│   ├── hooks/               # useRentals
│   ├── services/            # rentalService
│   └── types/               # Rental, RentalItem
│
├── availability/            # Cálculo de disponibilidad (CORE)
│   ├── components/
│   │   ├── StockBreakageList.tsx    # Listado principal de roturas
│   │   ├── StockBreakageRow.tsx     # Fila con indicadores
│   │   ├── ArticleDetailModal.tsx   # Detalle al hacer clic
│   │   └── AvailabilityBadge.tsx    # Indicador visual OK/FALTA
│   ├── hooks/
│   │   ├── useAvailability.ts       # Hook principal
│   │   └── useArticleDetail.ts      # Detalle por artículo
│   ├── services/
│   │   └── availabilityService.ts   # Queries y cálculos
│   └── types/
│       └── availability.ts          # StockBreakage, ArticleAvailability
│
└── import/                  # Importacion de datos legacy (manual)
    ├── actions/             # Server Actions para importar
    ├── services/            # legacyService, transformService
    └── types/               # ImportConfig, ImportResult

sync/                        # Servicio de sincronizacion automatica (standalone)
├── src/
│   ├── services/            # sqlServerService, supabaseService, syncService
│   ├── transformers/        # Transformadores de datos
│   └── utils/               # Logger, chunker
├── Dockerfile               # Imagen Docker para produccion
├── docker-compose.yml
├── scripts/install.sh       # Instalacion en servidor Linux
└── README.md                # Documentacion completa
```

### Stack Confirmado

| Capa | Tecnología |
|------|------------|
| **Frontend** | Next.js 16 + React 19 + TypeScript |
| **Estilos** | Tailwind CSS 3.4 + shadcn/ui |
| **Backend** | Supabase (Auth + PostgreSQL + RLS) |
| **Validación** | Zod |
| **State** | Zustand (para filtros y UI state) |
| **Testing** | Playwright MCP |
| **Deploy** | Vercel |

### Consideraciones de Performance

El sistema legacy procesa dia a dia desde hoy hasta fin de año. Para optimizar:

1. **Calculo bajo demanda**: No precalcular todo, sino calcular cuando se consulta
2. **Query optimizada**: Una sola query con agregacion en lugar de N queries
3. **Indices**: En `rental_items(article_id)`, `rentals(delivery_date, pickup_date)`
4. **Cache**: Considerar cache de resultados con invalidacion al crear reservas

### Sincronizacion de Datos (SQL Server -> Supabase)

Existen dos mecanismos de sincronizacion:

**1. Importacion Manual (Feature Import)**
- Ubicacion: `src/features/import/`
- Uso: Server Actions ejecutadas desde el dashboard de la aplicacion web
- Cuando usar: Sincronizacion puntual o para pruebas en desarrollo
- Requiere: Conectividad desde donde corre el frontend (Vercel, localhost)

**2. Sincronizacion Automatica (Sync Service)**
- Ubicacion: `sync/` (proyecto standalone)
- Uso: Servicio dockerizado ejecutado via cron en servidor Linux del CPD
- Frecuencia: Cada 2 horas (configurable)
- Ventajas:
  - Acceso directo a SQL Server desde red interna
  - No depende de la disponibilidad del frontend
  - Logging detallado con rotacion diaria
  - Notificaciones por email en caso de error
  - Lock file para evitar ejecuciones concurrentes

**Arquitectura de Sincronizacion:**
```
┌─────────────────────────────────────────────────────────────┐
│                    MAQUINA LINUX (CPD)                      │
│                                                             │
│  ┌──────────────┐     ┌───────────────────────────────────┐│
│  │    CRON      │────>│      Docker Container             ││
│  │  0 */2 * * * │     │    enteza-sync:latest             ││
│  └──────────────┘     └───────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                                   │
         ▼                                   ▼
┌────────────────────┐              ┌──────────────────┐
│    SQL Server      │              │    Supabase      │
│  (Sevilla/Jerez)   │              │   (PostgreSQL)   │
│   Red interna CPD  │              │   Internet/VPN   │
└────────────────────┘              └──────────────────┘
```

**Flujo de sincronizacion:**
1. Articulos (SEVILLA + JEREZ) -> `articles` + `article_stock`
2. Clientes (SEVILLA como master) -> `customers` (excluye internos 410000, 110000)
3. Reservas (SEVILLA + JEREZ) -> `rentals` + `rental_items`
4. Timestamp -> `system_settings.last_import_at`

Ver `sync/README.md` para documentacion completa de instalacion y uso.

**Query optimizada propuesta:**
```sql
SELECT
  a.id,
  a.description,
  d.target_date,
  COALESCE(SUM(ast.quantity), 0) as total_stock,
  COALESCE(SUM(ri.quantity), 0) as committed,
  COALESCE(SUM(ast.quantity), 0) - COALESCE(SUM(ri.quantity), 0) as available
FROM articles a
CROSS JOIN generate_series(CURRENT_DATE, '2026-12-31'::date, '1 day') as d(target_date)
LEFT JOIN article_stock ast ON ast.article_id = a.id
LEFT JOIN rental_items ri ON ri.article_id = a.id
LEFT JOIN rentals r ON r.id = ri.rental_id
  AND r.delivery_date <= d.target_date
  AND r.pickup_date >= d.target_date
  AND r.status != 'cancelled'
LEFT JOIN customers c ON c.id = r.customer_id
  AND c.is_internal = false
WHERE a.is_active = true
GROUP BY a.id, a.description, d.target_date
HAVING COALESCE(SUM(ast.quantity), 0) - COALESCE(SUM(ri.quantity), 0) < 0
ORDER BY d.target_date, a.description;
```

---

## 8. Fases de Implementación

### Fase 1: MVP - Consulta de Disponibilidad (EN PROGRESO)

| # | Feature | Estado | Descripcion |
|---|---------|--------|-------------|
| 1 | Auth | PENDIENTE | Login/Logout con Supabase Email/Password |
| 2 | Import Manual | COMPLETADO | Server Actions para importar desde SQL Server |
| 3 | Import Automatico | COMPLETADO | Servicio `sync/` para cron en CPD con Docker |
| 4 | Availability | COMPLETADO | Listado de roturas de stock con detalle por articulo |
| 5 | Multi-almacen | COMPLETADO | Mostrar stock Sevilla/Jerez por separado |

**Entregable:** Aplicacion web que replica la funcionalidad del sistema PHP actual.

### Fase 2: Gestión de Reservas

| # | Feature | Descripción |
|---|---------|-------------|
| 5 | Customers | CRUD de clientes |
| 6 | Rentals | Crear/editar reservas con cálculo de disponibilidad en tiempo real |
| 7 | Alerts | Notificaciones de sobreventa |

### Fase 3: Operaciones

| # | Feature | Descripción |
|---|---------|-------------|
| 8 | Delivery Notes | Albaranes de entrega |
| 9 | Pickup Notes | Albaranes de recogida |
| 10 | Invoicing | Facturación |
| 11 | Payments | Gestión de cobros |

---

## 9. Próximos Pasos (MVP)

1. [ ] Configurar proyecto base (Next.js 16 + Supabase)
2. [ ] Crear esquema de base de datos en Supabase
3. [ ] Implementar autenticación (Email/Password)
4. [ ] Feature: Import - Importar datos del sistema legacy
5. [ ] Feature: Availability - Listado de roturas de stock
6. [ ] Feature: Availability - Detalle por artículo
7. [ ] Testing E2E con Playwright
8. [ ] Deploy en Vercel

---

## 10. Glosario

| Termino | Definicion |
|---------|------------|
| **Rotura de Stock** | Cuando las unidades comprometidas superan el stock disponible |
| **Sobreventa** | Reservar mas unidades de las que se tienen (deficit) |
| **Disponibilidad** | Stock total menos unidades comprometidas para una fecha |
| **Fecha Entrega** | Dia en que el material sale del almacen hacia el cliente |
| **Fecha Evento** | Dia del evento del cliente (fecha maestra para la UI) |
| **Fecha Recogida** | Dia en que el material vuelve al almacen |
| **Prestamo Interno** | Movimiento de material entre almacenes (no cuenta como reserva) |
| **Sync Service** | Servicio standalone en `sync/` que sincroniza datos automaticamente via cron |
| **Lock File** | Archivo temporal que previene ejecuciones simultaneas del sync |
| **Service Role Key** | Clave de Supabase con permisos elevados para bypass de RLS |

---

*"Primero entiende el negocio. Después escribe código."*
