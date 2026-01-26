# 🚀 Guía de Pruebas - Optimización de Disponibilidad

## Cambios Implementados

### 1. Funciones SQL Optimizadas
- ✅ `get_stock_breakages_optimized()` - Calcula solo días con eventos (no todos los días del año)
- ✅ `get_article_reservations_optimized()` - Genera fechas solo dentro del rango de cada reserva
- ✅ Índices estratégicos para mejorar rendimiento

### 2. Código TypeScript Actualizado
- ✅ `availabilityService.ts` - Ahora usa las funciones optimizadas

## Cómo Probar

### Paso 1: Ejecutar Migración SQL (Si aún no lo has hecho)

**Opción A - Dashboard de Supabase:**
1. Abre Supabase Dashboard
2. Ve a SQL Editor
3. Ejecuta el contenido de `supabase-migrations/optimized-functions.sql`

**Opción B - CLI:**
```bash
cd new-machu
psql -h localhost -p 54322 -d postgres -U postgres -f supabase-migrations/optimized-functions.sql
```

### Paso 2: Iniciar Aplicación Local

```bash
npm run dev
```

### Paso 3: Medir Rendimiento

1. **Abre la consola del navegador** (F12 → Console)

2. **Navega a Disponibilidad:**
   - Click en "Disponibilidad" en el menú lateral
   - Observa el tiempo de carga en la consola

3. **Comparar tiempos:**
   - **Antes:** 5-30 segundos ❌
   - **Esperado ahora:** 0.5-2 segundos ✅

### Paso 4: Validar Datos

1. **Verifica que los datos sean correctos:**
   - Los artículos con rotura de stock deben coincidir
   - Las fechas de rotura deben ser las mismas
   - Los números de stock comprometido deben ser iguales

2. **Prueba diferentes rangos de fechas:**
   - Este mes
   - Próximo mes
   - Este trimestre
   - Este año

### Paso 5: Verificar Detalle de Artículo

1. Click en cualquier artículo con rotura
2. Verifica que aparezcan las reservas correctamente
3. El tiempo de carga debe ser instantáneo

## Qué Buscar

### ✅ Señales de Éxito
- [ ] Tiempo de carga < 2 segundos
- [ ] Los datos son idénticos a la versión anterior
- [ ] No hay errores en la consola
- [ ] El detalle de artículos carga instantáneamente

### ❌ Posibles Problemas

**Si ves errores de "function does not exist":**
- La migración SQL no se ejecutó correctamente
- Vuelve a ejecutar el archivo SQL

**Si los datos son diferentes:**
- Revisa la lógica de las funciones SQL
- Compara los resultados con la función anterior

**Si sigue lento:**
- Verifica que los índices se crearon correctamente
- Ejecuta `ANALYZE` en PostgreSQL para actualizar estadísticas

## SQL de Diagnóstico

Para verificar que las funciones existen:

```sql
-- Verificar funciones
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name LIKE '%optimized%';

-- Verificar índices
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND tablename IN ('rentals', 'rental_items', 'article_stock', 'customers');
```

## Mejora Esperada

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Tiempo de respuesta | 5-30s | 0.5-2s | **10-50x** |
| Filas procesadas | 365,000+ | ~50-500 | **99% menos** |
| Uso de CPU | Alto | Bajo | Significativa |
| Uso de memoria | Alto | Bajo | Significativa |

## Siguiente Paso

Una vez validado en local, podemos hacer el deploy a Vercel:

```bash
git add .
git commit -m "feat: optimize availability calculations (10-50x faster)

- Add optimized SQL functions using event-based date generation
- Create strategic indexes for performance
- Update TypeScript service to use optimized functions
- Reduce query time from 5-30s to 0.5-2s"
git push origin main
```
