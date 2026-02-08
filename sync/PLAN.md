# Plan: Servicio de Importación Automática (Cron)

> **NOTA**: Este módulo es COMPLEMENTARIO a la importación desde la aplicación web.
> La funcionalidad de `src/features/import/` NO debe ser modificada ni eliminada.

## Resumen Ejecutivo

Crear un servicio Node.js standalone que se ejecute desde cron en una máquina Linux del CPD, con acceso directo a SQL Server (origen) y Supabase (destino), para sincronizar datos automáticamente.

---

## Contexto Actual

### Sistema Existente
El proyecto ya tiene lógica de importación implementada en:
- `src/features/import/services/legacyService.ts` - Conexión a SQL Server
- `src/features/import/actions/importActions.ts` - Lógica de transformación e inserción
- `src/features/import/services/transformService.ts` - Transformación de datos

### Limitación del Sistema Web
La importación actual usa **Server Actions de Next.js**, lo que significa:
1. Requiere que el servidor Next.js esté corriendo
2. Se ejecuta a través de HTTP (frontend → backend)
3. No es invocable directamente desde cron

### Este Módulo
Este servicio de sincronización es **adicional** y permite:
1. Ejecución automática desde cron sin intervención humana
2. Ejecución directa en el CPD con acceso a la red interna
3. No depende del servidor web

---

## Arquitectura Propuesta

```
┌──────────────────────────────────────────────────────────────────────┐
│                          MÁQUINA LINUX (CPD)                         │
│                                                                      │
│  ┌──────────────┐     ┌────────────────────────────────────────────┐│
│  │    CRON      │────▶│           Docker Container                 ││
│  │  0 */2 * * * │     │         enteza-sync:latest                 ││
│  └──────────────┘     │                                            ││
│                       │  ┌────────────┐  ┌────────────────┐        ││
│                       │  │ SQL Server │  │    Supabase    │        ││
│                       │  │  (mssql)   │  │ (@supabase/js) │        ││
│                       │  └─────┬──────┘  └───────┬────────┘        ││
│                       │        │                 │                 ││
│  ┌──────────────┐     │  ┌─────┴─────────────────┴─────┐           ││
│  │   /var/log   │◀────│──│     Volume: /app/logs       │           ││
│  │ enteza-sync/ │     │  └─────────────────────────────┘           ││
│  └──────────────┘     └────────────────────────────────────────────┘│
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
         │                                   │
         ▼                                   ▼
┌────────────────────┐              ┌──────────────────┐
│    SQL Server      │              │    Supabase      │
│  (Sevilla/Jerez)   │              │   (PostgreSQL)   │
│   Red interna CPD  │              │   Internet/VPN   │
└────────────────────┘              └──────────────────┘
```

---

## Estructura del Proyecto

```
sync/                           # Subdirectorio en el monorepo
├── package.json
├── tsconfig.json
├── Dockerfile                  # Imagen Docker
├── docker-compose.yml          # Orquestación
├── .env.example
├── .env                        # No commiteado
├── src/
│   ├── index.ts                # Entry point CLI
│   ├── config.ts               # Configuración desde ENV
│   ├── services/
│   │   ├── sqlServerService.ts # Conexión SQL Server
│   │   ├── supabaseService.ts  # Cliente Supabase con service_role_key
│   │   ├── syncService.ts      # Orquestador de sincronización
│   │   └── emailService.ts     # Notificaciones por email
│   ├── transformers/
│   │   ├── articleTransformer.ts
│   │   ├── customerTransformer.ts
│   │   └── rentalTransformer.ts
│   ├── utils/
│   │   ├── logger.ts           # Logging estructurado
│   │   └── chunker.ts          # Procesamiento en lotes
│   └── types/
│       └── index.ts            # Tipos compartidos
├── logs/                       # Logs de ejecución (volume Docker)
└── scripts/
    ├── entrypoint.sh           # Script de entrada Docker
    └── install.sh              # Instalación en servidor
```

---

## Dockerización

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Dependencias del sistema para mssql
RUN apk add --no-cache python3 make g++ unixodbc-dev

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

# Usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S enteza -u 1001 -G nodejs
USER enteza

ENTRYPOINT ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  enteza-sync:
    build: .
    image: enteza-sync:latest
    container_name: enteza-sync
    env_file: .env
    volumes:
      - ./logs:/app/logs
    restart: "no"  # Se ejecuta por cron, no siempre activo
    networks:
      - enteza-net

networks:
  enteza-net:
    driver: bridge
```

### Ejecución con Docker

```bash
# Build de la imagen
docker build -t enteza-sync:latest .

# Ejecución manual (sincronización completa)
docker run --rm --env-file .env -v $(pwd)/logs:/app/logs enteza-sync

# Ejecución con warehouse específico
docker run --rm --env-file .env -v $(pwd)/logs:/app/logs enteza-sync --warehouse SEVILLA

# Dry-run
docker run --rm --env-file .env enteza-sync --dry-run --verbose
```

### Cron con Docker

```bash
# /etc/cron.d/enteza-sync

# Sincronización completa cada 2 horas
0 */2 * * * root docker run --rm --env-file /opt/enteza-sync/.env -v /var/log/enteza-sync:/app/logs enteza-sync >> /var/log/enteza-sync/cron.log 2>&1

# Sincronización de maestros 1 vez al día (6am)
0 6 * * * root docker run --rm --env-file /opt/enteza-sync/.env -v /var/log/enteza-sync:/app/logs enteza-sync --only masters >> /var/log/enteza-sync/cron.log 2>&1
```

### Ventajas de Docker

| Beneficio | Descripción |
|-----------|-------------|
| **Portabilidad** | Mismo comportamiento en cualquier Linux |
| **Aislamiento** | No contamina el sistema con dependencias |
| **Versionado** | Imagen tagueada, fácil rollback |
| **Reproducible** | Build idéntico cada vez |
| **Fácil actualización** | `docker pull` + restart |

---

## Flujo de Sincronización

```
1. Iniciar
   ├── Cargar configuración (.env)
   ├── Validar conexiones (SQL Server + Supabase)
   └── Registrar inicio en log

2. Sincronizar Artículos
   ├── Obtener de SQL Server (SEVILLA + JEREZ)
   ├── Transformar a formato Supabase
   ├── Upsert en articles (ON CONFLICT legacy_id)
   └── Upsert en article_stock (ON CONFLICT article_id, warehouse_id)

3. Sincronizar Clientes
   ├── Obtener de SQL Server (solo SEVILLA como master)
   ├── Filtrar clientes internos (410000, 110000)
   ├── Transformar
   └── Upsert en customers (ON CONFLICT legacy_id)

4. Sincronizar Reservas
   ├── Para cada warehouse (SEVILLA, JEREZ):
   │   ├── Obtener cabeceras y detalles de SQL Server
   │   ├── Mapear customer_id y article_id
   │   ├── Upsert en rentals (ON CONFLICT legacy_id, warehouse_id)
   │   ├── Borrar rental_items antiguos
   │   └── Insertar rental_items nuevos
   └── Actualizar last_import_at en system_settings

5. Finalizar
   ├── Registrar resumen en log
   └── Enviar email si hay errores
```

---

## Variables de Entorno Requeridas

```env
# SQL Server Sevilla
SEVILLA_SQL_SERVER=192.168.x.x
SEVILLA_SQL_DATABASE=EntezaDB
SEVILLA_SQL_USER=usuario
SEVILLA_SQL_PASSWORD=contraseña

# SQL Server Jerez
JEREZ_SQL_SERVER=192.168.x.x
JEREZ_SQL_DATABASE=EntezaDB
JEREZ_SQL_USER=usuario
JEREZ_SQL_PASSWORD=contraseña

# Supabase (usar service_role_key para bypass RLS)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Logging
LOG_LEVEL=info
LOG_DIR=/app/logs

# Email (para notificaciones de error)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alertas@empresa.com
SMTP_PASSWORD=app_password
ALERT_EMAIL_TO=admin@empresa.com
```

---

## Interfaz CLI

```bash
# Sincronización completa (ambos warehouses)
npm run sync

# Sincronización de un warehouse específico
npm run sync -- --warehouse SEVILLA

# Sincronización solo de maestros (artículos + clientes)
npm run sync -- --only masters

# Sincronización solo de reservas
npm run sync -- --only rentals

# Modo dry-run (no escribe en Supabase)
npm run sync -- --dry-run

# Modo verbose
npm run sync -- --verbose
```

---

## Manejo de Errores

1. **Conexión fallida**: Reintentar 3 veces con backoff exponencial
2. **Error parcial**: Continuar con siguiente entidad, reportar al final
3. **Error crítico**: Abortar y notificar por email
4. **Lock file**: Prevenir ejecuciones simultáneas

---

## Verificación

1. **Test de conexiones**:
   ```bash
   npm run test:connections
   ```

2. **Dry-run completo**:
   ```bash
   npm run sync -- --dry-run --verbose
   ```

3. **Ejecución manual**:
   ```bash
   npm run sync -- --warehouse SEVILLA
   ```

4. **Verificar en dashboard**:
   - Comprobar que `last_import_at` se actualizó
   - Verificar conteo de registros en Supabase

---

## Decisiones Confirmadas

| Aspecto | Decisión |
|---------|----------|
| **Ubicación** | Subdirectorio `sync/` dentro del monorepo |
| **Notificaciones** | Email cuando hay errores críticos |
| **Auditoría** | Solo `last_import_at` (como está actualmente) |
| **Relación con app web** | Complementario, no reemplaza la importación manual |
