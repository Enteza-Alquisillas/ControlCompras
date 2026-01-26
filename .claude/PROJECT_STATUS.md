# Estado del Proyecto: Enteza Reservas App (Machu)

> Ultima actualizacion: 2026-01-26
> Lee este archivo al inicio de cada sesion para retomar el contexto.

---

## 1. Resumen Ejecutivo

**Aplicacion:** Enteza Reservas App - Sistema de gestion de alquiler de material para eventos.

**Problema principal:** Calcular disponibilidad real de articulos y gestionar el flujo de reservas centrado en la fecha del evento.

**Estado actual:** MVP Fase 2 Completada - Feature de Reservas (Calendario V3.1 + Dashboard de Disponibilidad) funcional y desplegada en Vercel.

---

## 2. Lo que YA esta implementado

### Base de Datos (Supabase)

| Tabla | Estado | Descripcion |
|-------|--------|-------------|
| `warehouses` | OK | 2 almacenes (Sevilla, Jerez) |
| `articles` | OK | Gestión de inventario |
| `article_stock` | OK | Stock por almacen |
| `customers` | OK | Base de datos de clientes |
| `rentals` | OK | Maestro de reservas (pivot: `event_date`) |
| `rental_items` | OK | Detalle de artículos por reserva |

**Funciones SQL:**
- `get_stock_breakages_optimized(start_date, end_date)` - Calcula roturas considerando rangos (delivery->pickup)
- `get_article_reservations_optimized(article_id, start_date, end_date)` - Detalle por articulo

**RLS:** Habilitado en todas las tablas. Acceso para `authenticated` y `anon` (lectura).

### Frontend (Next.js 16 + React 19)

**Feature Availability (CORE):**
```
src/features/availability/
├── components/
│   ├── StockBreakageList.tsx    # Listado principal de roturas
│   ├── StockBreakageRow.tsx     # Fila con indicadores visuales
│   ├── ArticleDetailModal.tsx   # Modal con detalle de reservas
│   └── AvailabilityBadge.tsx    # Badge de severidad
├── hooks/
│   ├── useAvailability.ts       # Hook para cargar roturas
│   └── useArticleDetail.ts      # Hook para detalle
├── services/
│   └── availabilityService.ts   # Llamadas RPC a Supabase
├── types/
│   └── index.ts                 # Tipos TypeScript
└── index.ts                     # Exports publicos
```

**Feature Reservations (NUEVO):**
```
src/features/reservations/
├── components/
│   ├── BookingCalendar.tsx      # Calendario V3.1 con indicadores (V/Am/R)
│   ├── DailyAvailabilityTable.tsx # Roturas para el día seleccionado
│   ├── DailyRentalsTable.tsx    # Eventos programados el día seleccionado
│   └── RentalDetailModal.tsx    # Ficha completa del evento (cabecera + items)
├── store/
│   └── useReservationsStore.ts  # Estado global de fecha seleccionada
├── services/
│   └── reservationsService.ts   # Lógica centada en event_date
└── types/
    └── index.ts                 # Tipos compartidos
```

**Layout y Navegacion:**
- `src/app/(main)/layout.tsx` - Layout con sidebar
- `src/app/(main)/components/Sidebar.tsx` - Navegacion (client component)
- `src/app/(main)/dashboard/page.tsx` - Pagina principal

**Tipos Supabase:**
- `src/lib/supabase/database.types.ts` - Tipos generados

**Marca e Identidad:**
- Título: "Enteza Reservas App"
- Idioma: Español (ES)

### Datos de Prueba

Las reservas generan roturas de stock del **1-5 febrero 2026**:
- Silla plegable blanca: -240 unidades (peor dia)
- Copa de vino cristal: -110 unidades
- Plato llano porcelana: -90 unidades

---

## 3. Lo que FALTA por implementar

### Fase 1: MVP (Prioridad ALTA)

| Feature | Estado | Descripcion |
|---------|--------|-------------|
| Auth | PENDIENTE | Login/Logout con Supabase Email/Password |
| Import | PENDIENTE | Importar articulos, stock y reservas (Maestros) |
| Filtros | PENDIENTE | Búsqueda por artículo en tabla de disponibilidad |

### Fase 2: Gestión de Operaciones

| Feature | Estado | Descripcion |
|---------|--------|-------------|
| Customers CRUD | PENDIENTE | Gestión de clientes |
| Rentals CRUD | PENDIENTE | Pantalla de Nueva Reserva / Edición |
| Delivery Notes | PENDIENTE | Formatos de impresión de albaranes |

---

## 4. Decisiones Tecnicas Clave

- **Fisica vs Visual:** El stock se compromete por el rango total de fechas (entrega-recogida), pero la UI filtra y cuenta eventos solo por la `event_date`.
- **Calendario V3.1:** Implementado con `BookingCalendar.tsx` para evitar conflictos de caché y renderizado seguro en cliente (`mounted` state) para eliminar Hydration Errors.

---

## 5. Problemas Encontrados y Soluciones

### 1. Error: Event handlers cannot be passed to Client Component props
- **Causa:** onClick en Server Component
- **Solucion:** Extraer navegacion a `Sidebar.tsx` con 'use client'

### 2. Error: Module not found 'fs' en Tailwind
- **Causa:** Sintaxis de Tailwind v4 en CSS
- **Solucion:** Cambiar `@import 'tailwindcss'` a directivas clasicas

### 3. Funciones RPC no retornaban datos
- **Causa:** RLS bloqueaba acceso a usuarios anonimos
- **Solucion:** Agregar politicas y permisos para anon (migracion `allow_anon_access_for_demo`)

### 4. Tipos TypeScript para RPC
- **Causa:** Supabase client no reconocia funciones
- **Solucion:** Type assertion en availabilityService.ts

---

## 6. Comandos Utiles

```bash
# Desarrollo
npm run dev              # Servidor en http://localhost:3000

# Verificar tipos
./node_modules/.bin/tsc --noEmit

# Ver migraciones aplicadas
# Usar Supabase MCP: mcp__supabase__list_migrations
```

---

## 7. Proximos Pasos Recomendados

1. **Implementar Auth** - Para que los usuarios inicien sesion
   - Usar Supabase Email/Password
   - Proteger rutas con middleware
   - Mostrar usuario en header

2. **Implementar Import** - Para cargar datos reales
   - Subir CSV con articulos
   - Subir CSV con reservas
   - Mapear campos legacy_id

3. **Mejorar Dashboard** - Stats cards con datos reales
   - Total articulos con stock OK
   - Total articulos con rotura
   - Proxima fecha con rotura

---

## 8. Estructura de Archivos Clave

```
new-machu/
├── .claude/
│   └── PROJECT_STATUS.md        # ESTE ARCHIVO
├── BUSINESS_LOGIC.md            # Requisitos del negocio
├── CLAUDE.md                    # Instrucciones para Claude
├── src/
│   ├── app/
│   │   ├── (auth)/              # Rutas de auth (login, signup)
│   │   ├── (main)/              # Rutas principales
│   │   │   ├── dashboard/       # Pagina de disponibilidad
│   │   │   └── components/      # Sidebar
│   │   ├── globals.css          # Tailwind directives
│   │   └── layout.tsx           # Root layout
│   ├── features/
│   │   └── availability/        # Feature implementada
│   ├── lib/
│   │   └── supabase/            # Cliente y tipos
│   └── shared/                  # Componentes compartidos (vacio)
└── package.json
```

---

## 9. Credenciales y Configuracion

**Supabase:** Configurado via `.env.local` (no commiteado)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**MCP Supabase:** Conectado al proyecto (ver `.mcp.json`)

---

*Generado automaticamente. Actualizar despues de cada sesion de trabajo.*
