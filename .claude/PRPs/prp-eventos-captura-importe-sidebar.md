# PRP-001: Fecha de captura e importe en Eventos Programados + sidebar replegable

> **Estado**: IMPLEMENTADO en local (pendiente aplicar migracion y redesplegar sync). Decisiones: importe = `SALDO` (`balance_amount`), fecha = `FECHA_CAPTURA` (`captured_at`), ambos de cabecera; sin backfill del historico.
> **Fecha**: 2026-10-30
> **Proyecto**: new-machu (Enteza Reservas)

---

## Objetivo

La tabla "Eventos Programados" muestra dos columnas nuevas, fecha de captura del pedido e importe total, tomadas de SQL Server mediante el sync. El sidebar se puede replegar a una barra de solo iconos y expandir con un botón.

## Por Qué

| Problema | Solución |
|----------|----------|
| No se ve cuándo se cerró el pedido ni cuánto vale; hay que abrir el sistema legacy | Columnas FECHA CAPTURA e IMPORTE en la tabla, rellenadas por el sync |
| El sidebar de 256 px resta ancho a una tabla que ya tiene 7 columnas (9 con las nuevas) | Sidebar replegable a ~64 px, solo iconos, con botón para expandir |

**Valor de negocio**: ver de un vistazo antigüedad e importe de cada evento del día, sin cambiar de aplicación, y ganar espacio útil en pantallas pequeñas.

## Qué

### Criterios de Éxito
- [ ] La tabla muestra FECHA CAPTURA (dd/MM/yyyy) e IMPORTE (€, formato es-ES) por contrato
- [ ] Tras un sync real, los contratos de Sevilla y Jerez tienen ambos valores en Supabase
- [ ] Un importe 0 se guarda como 0 y un dato ausente se muestra como "-" (no se confunden)
- [ ] El botón del sidebar alterna entre expandido (w-64) y replegado (w-16, solo iconos) y el contenido principal se reajusta sin saltos
- [ ] En modo replegado cada icono tiene tooltip con su nombre, y el estado se recuerda tras recargar
- [ ] `npx tsc --noEmit` y `npm run build` pasan

### Comportamiento Esperado
1. El sync lee de `EVENTO_ALQUILER` la fecha de captura y el importe total, y los guarda en `rentals` (`captured_at`, `total_amount`).
2. En Reservas, "Eventos Programados" lista cada contrato con las dos columnas nuevas entre CLIENTE y ENTREGA (captura) y tras PLAZAS (importe, alineado a la derecha).
3. El usuario pulsa el botón de pliegue en la cabecera del sidebar: queda solo con iconos, el contenido ocupa el ancho liberado. Otra pulsación lo expande. Al recargar conserva la elección.

---

## Contexto

### Referencias
- `src/features/reservations/components/DailyRentalsTable.tsx` - tabla a ampliar (7 columnas, `colSpan={7}` en los estados vacío/cargando)
- `src/features/reservations/types/index.ts` - `Rental` deriva de `database.types.ts`, hay que regenerar tipos
- `sync/src/services/sqlServerService.ts` (`getRentals`) y `src/features/import/services/legacyService.ts` (caso `rentals`) - dos consultas gemelas a `EVENTO_ALQUILER`; deben actualizarse las dos
- `sync/src/types/index.ts` (`RentalLegacy`, `TransformedRental`) y `sync/src/transformers/rentalTransformer.ts` - transformación y `toDateString`
- `sync/src/services/supabaseService.ts` (`upsertRentals`, onConflict `legacy_id,warehouse_id`)
- `src/app/(main)/components/Sidebar.tsx` (aside `fixed w-64`, tiene `LastImportIndicator` y toast de "solo local") y `src/app/(main)/layout.tsx` (server component con `pl-64` fijo)
- Memoria "Sync idempotency: explicit zero" y "Sync rental wipe incident": cualquier cambio en el sync respeta esas lecciones

### Hallazgos de la investigación
- Ni `rentals` ni la consulta actual tienen fecha de captura ni importe. Es dato nuevo.
- **Los nombres de columna en SQL Server se desconocen**: no están en el repositorio y la base solo es accesible desde la LAN de la oficina. Hay que descubrirlos con un SELECT de solo lectura (regla: SQL Server es solo lectura).
- El importe puede estar en la cabecera (`EVENTO_ALQUILER`) o calcularse de las líneas (`EVENTO_ALQUILER_DETALLE`). Si es de líneas, la consulta actual ya hace JOIN, pero el transformer solo toma la primera fila por `ID_EVENTO`; habría que sumar, no tomar la primera.
- La ventana del sync es `FECHA_EVENTO >= hoy - 3 meses`: los contratos anteriores quedarán con NULL hasta un backfill puntual.
- El layout es server component; el estado del sidebar necesita un contenedor cliente que comparta estado entre `Sidebar` y el `pl-64` del contenido.
- Aviso: la skill `rental-analytics` y el chat afirman que no hay datos de precio. Tras esta feature habrá que actualizar esa documentación (y valorar exponerlo al asistente).

### Arquitectura Propuesta
```
sync/src/                         # columnas nuevas en consulta, tipos, transformer
src/features/reservations/
└── components/DailyRentalsTable.tsx   # 2 columnas + formato
src/app/(main)/
├── components/
│   ├── Sidebar.tsx                    # modo colapsado, tooltips, botón
│   └── MainShell.tsx (nuevo, client)  # estado collapsed + padding dinámico
└── layout.tsx                         # usa MainShell
```
Estado del sidebar: `useState` con persistencia en `localStorage` (try/catch, sin él arranca expandido). Sin Zustand ni backend: es una preferencia local.

### Modelo de Datos
```sql
ALTER TABLE rentals
  ADD COLUMN captured_at  DATE,
  ADD COLUMN total_amount NUMERIC(12,2);
-- Ambas nullable: NULL = el legacy no lo informó; 0 = informado como cero.
-- RLS de rentals ya está habilitado; no hay cambios de política.
```

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar en cada fase (bucle agéntico).

### Fase 1: Descubrir las columnas en SQL Server
**Objetivo**: conocer el nombre, tipo y semántica de la fecha de captura y del importe total en Sevilla y Jerez (solo SELECT, desde la LAN de oficina).
**Validación**: nombres confirmados en ambas bases, con muestra de valores reales, y decidido si el importe viene de cabecera o de suma de líneas.

### Fase 2: Modelo de datos y tipos
**Objetivo**: migración con `captured_at` y `total_amount` en `rentals` y `database.types.ts` regenerado.
**Validación**: columnas visibles en Supabase y `npx tsc --noEmit` sin errores nuevos.

### Fase 3: Sync (consulta, transformer, upsert)
**Objetivo**: ambas consultas (sync y import local) traen los datos, el transformer los convierte (cero explícito, NULL solo si no hay dato) y el upsert los persiste. Revisar antes de ejecutar de verdad que no se toca ningún paso de borrado.
**Validación**: simulación (`--dry-run`) muestra valores correctos; una ejecución real acotada rellena filas de ambos almacenes sin cambiar el número de rentals.

### Fase 4: Columnas en la tabla de eventos
**Objetivo**: FECHA CAPTURA e IMPORTE en `DailyRentalsTable`, con formato es-ES, "-" si NULL, y `colSpan` actualizado.
**Validación**: Playwright confirma las columnas con datos reales y que la tabla no desborda de forma anómala.

### Fase 5: Sidebar replegable
**Objetivo**: `MainShell` cliente, `Sidebar` con modo icono (tooltips, logo reducido, indicador de sync y avisos adaptados) y botón de pliegue persistente.
**Validación**: Playwright en expandido y replegado; el contenido se reajusta; el estado sobrevive a recargar.

### Fase 6: Validación Final
**Objetivo**: sistema funcionando end-to-end y documentación al día.
**Validación**:
- [ ] `npx tsc --noEmit` pasa (no existe script `typecheck`)
- [ ] `npm run build` exitoso
- [ ] Playwright screenshot confirma ambas funciones
- [ ] Criterios de éxito cumplidos
- [ ] `ARCHITECTURE.md`, `BUSINESS_LOGIC.md` y la skill `rental-analytics` reflejan que ya hay importe

---

## Aprendizajes (Self-Annealing)

*(vacío hasta la implementación)*

---

## Gotchas

- [ ] SQL Server es solo lectura y solo accesible desde la oficina: el descubrimiento de columnas y la ejecución real del sync dependen de esa red
- [ ] `mssql` devuelve los bigint como texto y puede devolver DECIMAL/MONEY como número o texto; convertir y validar el tipo explícitamente
- [ ] Las consultas del sync y de `legacyService` están duplicadas: cambiar solo una deja datos inconsistentes
- [ ] El LEFT JOIN repite la cabecera por línea; un importe de cabecera no se debe sumar, uno de líneas sí
- [ ] Jerez y Sevilla pueden tener esquemas o semántica distintos (la base de Jerez ya tiene nombre dudoso)
- [ ] No filtrar 0 ni valores falsy antes del upsert
- [ ] Contratos fuera de la ventana de 3 meses quedan en NULL salvo backfill
- [ ] El layout `(main)` es server component: no meter `useState` directamente en él
- [ ] `localStorage` puede fallar (modo privado): try/catch y arrancar expandido
- [ ] Hidratación: leer el estado guardado tras montar para evitar desajuste servidor/cliente (aceptar un parpadeo mínimo)

## Anti-Patrones

- NO escribir nada en SQL Server
- NO tocar `deleteNonVigenteRentals` ni los pasos de borrado del sync
- NO duplicar el estado del sidebar en una tabla de Supabase
- NO ignorar errores de TypeScript ni usar `any`
- NO hardcodear anchos en varios sitios: una constante compartida para 64/16

---

*PRP pendiente de aprobación. No se ha modificado código.*
