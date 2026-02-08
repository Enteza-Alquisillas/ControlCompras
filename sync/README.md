# Enteza Sync

Servicio de sincronización automática de datos desde SQL Server (Sevilla/Jerez) hacia Supabase.

## Índice

1. [Resumen](#resumen)
2. [Arquitectura](#arquitectura)
3. [Estructura del Proyecto](#estructura-del-proyecto)
4. [Requisitos](#requisitos)
5. [Configuración](#configuración)
6. [Uso en Desarrollo](#uso-en-desarrollo)
7. [Guía de Despliegue en Producción](#guía-de-despliegue-en-producción)
8. [CLI Reference](#cli-reference)
9. [Flujo de Sincronización](#flujo-de-sincronización)
10. [Manejo de Errores](#manejo-de-errores)
11. [Logs y Monitoreo](#logs-y-monitoreo)
12. [Notificaciones por Email](#notificaciones-por-email)
13. [Troubleshooting](#troubleshooting)
14. [Mantenimiento](#mantenimiento)

---

## Resumen

**Enteza Sync** es un servicio Node.js standalone diseñado para ejecutarse desde cron en una máquina Linux del CPD. Su función es sincronizar datos entre los sistemas legacy (SQL Server en Sevilla y Jerez) y la nueva aplicación web (Supabase/PostgreSQL).

### Características principales

- **Standalone**: Proyecto independiente dentro del monorepo, no requiere Next.js
- **Dockerizado**: Imagen Docker lista para producción
- **Automatizado**: Configuración de cron incluida
- **Resiliente**: Reintentos automáticos con backoff exponencial
- **Observable**: Logs estructurados en JSON con rotación diaria
- **Alertable**: Notificaciones por email cuando hay errores

### Tecnologías utilizadas

| Componente | Tecnología | Versión |
|------------|------------|---------|
| Runtime | Node.js | 20+ |
| Lenguaje | TypeScript | 5.7+ |
| SQL Server | mssql | 12.x |
| Supabase | @supabase/supabase-js | 2.49+ |
| CLI | commander | 12.x |
| Logging | winston | 3.x |
| Email | nodemailer | 6.x |
| Container | Docker | 20+ |

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────┐
│                          MÁQUINA LINUX (CPD)                         │
│                                                                      │
│  ┌──────────────┐     ┌────────────────────────────────────────────┐│
│  │    CRON      │────>│           Docker Container                 ││
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

### Flujo de datos

1. **Cron** dispara el contenedor Docker cada 2 horas
2. El contenedor conecta a **SQL Server** (Sevilla y Jerez) en la red interna
3. Transforma los datos al formato de Supabase
4. Inserta/actualiza en **Supabase** (PostgreSQL en la nube)
5. Registra resultados en **logs** (montados como volumen)
6. Si hay errores, envía **notificación por email**

---

## Estructura del Proyecto

```
sync/
├── package.json              # Dependencias del proyecto
├── tsconfig.json             # Configuración TypeScript
├── .env.example              # Template de variables de entorno
├── .gitignore                # Archivos ignorados por git
├── Dockerfile                # Imagen Docker (multi-stage build)
├── docker-compose.yml        # Orquestación Docker
├── README.md                 # Esta documentación
│
├── src/
│   ├── index.ts              # CLI entry point (commander)
│   ├── config.ts             # Carga y validación de ENV
│   │
│   ├── services/
│   │   ├── sqlServerService.ts   # Conexión a SQL Server (Sevilla/Jerez)
│   │   ├── supabaseService.ts    # Cliente Supabase con service_role_key
│   │   ├── syncService.ts        # Orquestador principal de sincronización
│   │   └── emailService.ts       # Envío de notificaciones por email
│   │
│   ├── transformers/
│   │   ├── articleTransformer.ts   # Transforma artículos + stock
│   │   ├── customerTransformer.ts  # Transforma clientes
│   │   └── rentalTransformer.ts    # Transforma reservas + items
│   │
│   ├── utils/
│   │   ├── logger.ts         # Winston logger con rotación diaria
│   │   └── chunker.ts        # Procesamiento en lotes + retry con backoff
│   │
│   └── types/
│       └── index.ts          # Tipos TypeScript compartidos
│
├── logs/                     # Directorio de logs (volume Docker)
│
└── scripts/
    ├── install.sh            # Script de instalación en servidor Linux
    └── entrypoint.sh         # Entrypoint para Docker
```

### Descripción de componentes

| Archivo | Responsabilidad |
|---------|-----------------|
| `index.ts` | Parsea argumentos CLI, inicializa logger y ejecuta sync |
| `config.ts` | Carga variables de entorno y valida configuración |
| `sqlServerService.ts` | Queries a SQL Server con reintentos automáticos |
| `supabaseService.ts` | Operaciones CRUD en Supabase (upsert, delete, select) |
| `syncService.ts` | Orquesta el flujo completo: artículos → clientes → reservas |
| `emailService.ts` | Envía alertas HTML cuando hay errores |
| `*Transformer.ts` | Convierte datos legacy al formato de Supabase |
| `logger.ts` | Configura Winston con formato JSON y rotación |
| `chunker.ts` | Procesa arrays en lotes y retry con backoff exponencial |

---

## Requisitos

### Para desarrollo local

- **Node.js 20+** (recomendado: usar nvm)
- **npm 10+**
- Acceso de red a SQL Server (Sevilla y Jerez)
- Credenciales de Supabase (service_role_key)

### Para producción

- **Docker 20+** y **Docker Compose**
- **Linux** (probado en Ubuntu 22.04, Debian 12)
- Acceso de red a SQL Server desde la máquina
- Acceso a Internet para conectar a Supabase

### Puertos y conectividad

| Destino | Puerto | Protocolo |
|---------|--------|-----------|
| SQL Server Sevilla | 1433 | TCP |
| SQL Server Jerez | 1433 | TCP |
| Supabase | 443 | HTTPS |
| SMTP (opcional) | 587 | TCP/TLS |

---

## Configuración

### Variables de entorno

Copia `.env.example` a `.env` y configura todas las variables:

```env
# ============================================
# SQL Server Sevilla
# ============================================
SEVILLA_SQL_SERVER=192.168.1.10
SEVILLA_SQL_DATABASE=EntezaDB
SEVILLA_SQL_USER=sa
SEVILLA_SQL_PASSWORD=tu_password_sevilla

# ============================================
# SQL Server Jerez
# ============================================
JEREZ_SQL_SERVER=192.168.1.20
JEREZ_SQL_DATABASE=EntezaDB
JEREZ_SQL_USER=sa
JEREZ_SQL_PASSWORD=tu_password_jerez

# ============================================
# Supabase
# IMPORTANTE: Usar service_role_key (no anon_key)
# para bypass de RLS
# ============================================
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================
# Logging
# ============================================
LOG_LEVEL=info          # debug, info, warn, error
LOG_DIR=./logs          # En Docker: /app/logs

# ============================================
# Email Notifications (opcional)
# Deja en blanco para deshabilitar
# ============================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alertas@tuempresa.com
SMTP_PASSWORD=tu_app_password
ALERT_EMAIL_TO=admin@tuempresa.com
ALERT_EMAIL_FROM=alertas@tuempresa.com
```

### Obtener credenciales de Supabase

1. Ir a [Supabase Dashboard](https://supabase.com/dashboard)
2. Seleccionar tu proyecto
3. Ir a **Settings** → **API**
4. Copiar:
   - **URL**: `https://xxxx.supabase.co`
   - **service_role key** (NO anon key): `eyJhbGci...`

> ⚠️ **IMPORTANTE**: El `service_role_key` tiene acceso completo a la base de datos, sin restricciones RLS. Nunca exponerlo públicamente.

---

## Uso en Desarrollo

### Instalación

```bash
# Desde el directorio sync/
cd sync

# Instalar dependencias
npm install
```

### Comandos disponibles

```bash
# Probar conexiones a todas las bases de datos
npm run test:connections

# Sincronización completa (dry-run - no escribe en BD)
npm run sync -- --dry-run --verbose

# Sincronización completa (escribe en BD)
npm run sync

# Sincronizar solo un warehouse
npm run sync -- --warehouse SEVILLA
npm run sync -- --warehouse JEREZ

# Sincronizar solo maestros (artículos + clientes)
npm run sync:master

# Sincronizar solo reservas
npm run sync:rentals

# Verificar tipos TypeScript
npm run typecheck

# Build para producción
npm run build
```

### Ejemplo de salida

```
$ npm run sync -- --dry-run --verbose

2026-02-03 10:00:00 [info]: Sync started {"options":{"dryRun":true,"verbose":true}}
2026-02-03 10:00:01 [info]: Connection test successful {"warehouse":"SEVILLA"}
2026-02-03 10:00:02 [info]: Connection test successful {"warehouse":"JEREZ"}
2026-02-03 10:00:02 [info]: Supabase connection test successful
2026-02-03 10:00:03 [info]: Fetching articles {"warehouse":"SEVILLA"}
2026-02-03 10:00:05 [info]: Articles fetched {"warehouse":"SEVILLA","count":1523}
2026-02-03 10:00:05 [info]: [DRY-RUN] Would upsert 1523 articles and 1420 stock records
...

========== SYNC SUMMARY ==========
Started: 2026-02-03T10:00:00.000Z
Completed: 2026-02-03T10:00:45.000Z
Duration: 45s
Status: SUCCESS

✓ articles-SEVILLA: 1523 records
✓ articles-JEREZ: 892 records
✓ customers: 3421 records (2 skipped)
✓ rentals-SEVILLA: 156 records (3 skipped)
✓ rentals-JEREZ: 89 records (1 skipped)
==================================
```

---

## Guía de Despliegue en Producción

### Paso 1: Preparar el servidor Linux

```bash
# Conectar al servidor
ssh usuario@servidor-cpd

# Instalar Docker si no está instalado
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Crear directorio de instalación
sudo mkdir -p /opt/enteza-sync
sudo mkdir -p /var/log/enteza-sync
sudo chown $USER:$USER /opt/enteza-sync
sudo chown $USER:$USER /var/log/enteza-sync
```

### Paso 2: Copiar archivos al servidor

Desde tu máquina local (Windows):

```powershell
# Opción A: Usando SCP
scp -r sync/* usuario@servidor-cpd:/opt/enteza-sync/

# Opción B: Usando rsync (más eficiente)
rsync -avz --exclude 'node_modules' --exclude 'logs' sync/ usuario@servidor-cpd:/opt/enteza-sync/
```

O desde Git:

```bash
# En el servidor
cd /opt/enteza-sync
git clone https://tu-repo.git .
# o solo copiar el directorio sync/
```

### Paso 3: Configurar variables de entorno

```bash
# En el servidor
cd /opt/enteza-sync

# Copiar template
cp .env.example .env

# Editar con tus credenciales reales
nano .env
```

Configurar cada variable según tu entorno:

```env
# SQL Server Sevilla (IP real de tu red)
SEVILLA_SQL_SERVER=192.168.1.10
SEVILLA_SQL_DATABASE=EntezaDB
SEVILLA_SQL_USER=sa
SEVILLA_SQL_PASSWORD=RealPassword123

# SQL Server Jerez (IP real de tu red)
JEREZ_SQL_SERVER=192.168.1.20
JEREZ_SQL_DATABASE=EntezaDB
JEREZ_SQL_USER=sa
JEREZ_SQL_PASSWORD=RealPassword456

# Supabase (desde el dashboard)
SUPABASE_URL=https://abcdefghijk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# Logging
LOG_LEVEL=info
LOG_DIR=/app/logs

# Email (opcional pero recomendado)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alertas@tuempresa.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
ALERT_EMAIL_TO=admin@tuempresa.com
ALERT_EMAIL_FROM=alertas@tuempresa.com
```

### Paso 4: Proteger el archivo .env

```bash
# Solo el propietario puede leer/escribir
chmod 600 /opt/enteza-sync/.env
```

### Paso 5: Construir la imagen Docker

```bash
cd /opt/enteza-sync

# Build de la imagen
docker build -t enteza-sync:latest .

# Verificar que se creó correctamente
docker images | grep enteza-sync
```

Salida esperada:
```
enteza-sync   latest   abc123def456   10 seconds ago   245MB
```

### Paso 6: Probar conexiones

```bash
# Test de conexiones (sin escribir nada)
docker run --rm \
  --env-file /opt/enteza-sync/.env \
  enteza-sync:latest \
  --test-connections
```

Salida esperada:
```
2026-02-03 10:00:00 [info]: Testing connections...
2026-02-03 10:00:01 [info]: Connection test successful {"warehouse":"SEVILLA"}
2026-02-03 10:00:02 [info]: Connection test successful {"warehouse":"JEREZ"}
2026-02-03 10:00:02 [info]: Supabase connection test successful
2026-02-03 10:00:02 [info]: Connection test results {"sevilla":true,"jerez":true,"supabase":true}
```

### Paso 7: Ejecutar sincronización de prueba (dry-run)

```bash
# Dry-run: muestra qué haría sin escribir en la BD
docker run --rm \
  --env-file /opt/enteza-sync/.env \
  -v /var/log/enteza-sync:/app/logs \
  enteza-sync:latest \
  --dry-run --verbose
```

### Paso 8: Ejecutar primera sincronización real

```bash
# Primera sincronización real
docker run --rm \
  --env-file /opt/enteza-sync/.env \
  -v /var/log/enteza-sync:/app/logs \
  enteza-sync:latest

# Verificar logs
cat /var/log/enteza-sync/sync-$(date +%Y-%m-%d).log
```

### Paso 9: Configurar cron jobs

```bash
# Crear archivo de cron
sudo nano /etc/cron.d/enteza-sync
```

Contenido del archivo:

```bash
# Enteza Sync - Sincronización automática de datos
# Logs en: /var/log/enteza-sync/

# Sincronización completa cada 2 horas
0 */2 * * * root docker run --rm --env-file /opt/enteza-sync/.env -v /var/log/enteza-sync:/app/logs enteza-sync:latest >> /var/log/enteza-sync/cron.log 2>&1

# Sincronización de maestros (artículos + clientes) una vez al día a las 6am
0 6 * * * root docker run --rm --env-file /opt/enteza-sync/.env -v /var/log/enteza-sync:/app/logs enteza-sync:latest --only masters >> /var/log/enteza-sync/cron.log 2>&1
```

```bash
# Establecer permisos correctos
sudo chmod 644 /etc/cron.d/enteza-sync

# Verificar que cron lo reconoce
sudo systemctl restart cron
```

### Paso 10: Verificar que todo funciona

```bash
# Ver próximas ejecuciones de cron
sudo systemctl status cron

# Ver logs de cron
tail -f /var/log/enteza-sync/cron.log

# Ver logs de sincronización
tail -f /var/log/enteza-sync/sync-$(date +%Y-%m-%d).log

# Verificar en la aplicación web que last_import_at se actualizó
```

### Script de instalación automática (alternativa)

Si prefieres automatizar los pasos 5-9:

```bash
cd /opt/enteza-sync
sudo ./scripts/install.sh
```

Este script:
1. Crea los directorios necesarios
2. Construye la imagen Docker
3. Instala los cron jobs
4. Muestra instrucciones de próximos pasos

---

## CLI Reference

### Sintaxis

```bash
enteza-sync [options]
```

### Opciones

| Opción | Alias | Descripción | Ejemplo |
|--------|-------|-------------|---------|
| `--warehouse <WH>` | `-w` | Sincronizar solo SEVILLA o JEREZ | `--warehouse SEVILLA` |
| `--only <TYPE>` | | Solo sincronizar `masters` o `rentals` | `--only masters` |
| `--dry-run` | | No escribir en Supabase | `--dry-run` |
| `--verbose` | `-v` | Logging detallado (debug) | `--verbose` |
| `--test-connections` | | Probar conexiones y salir | `--test-connections` |
| `--no-lock` | | Permitir ejecuciones concurrentes | `--no-lock` |
| `--help` | `-h` | Mostrar ayuda | `--help` |
| `--version` | `-V` | Mostrar versión | `--version` |

### Ejemplos de uso

```bash
# Sincronización completa
docker run --rm --env-file .env enteza-sync

# Solo Sevilla, modo verbose
docker run --rm --env-file .env enteza-sync -w SEVILLA -v

# Solo maestros (artículos + clientes)
docker run --rm --env-file .env enteza-sync --only masters

# Solo reservas de Jerez
docker run --rm --env-file .env enteza-sync -w JEREZ --only rentals

# Dry-run completo con logs
docker run --rm --env-file .env -v ./logs:/app/logs enteza-sync --dry-run --verbose
```

---

## Flujo de Sincronización

### Orden de ejecución

```
┌─────────────────┐
│  1. ARTÍCULOS   │  ← Para cada warehouse (SEVILLA, JEREZ)
│  + STOCK        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. CLIENTES    │  ← Solo desde SEVILLA (es el master)
│                 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. RESERVAS    │  ← Para cada warehouse (SEVILLA, JEREZ)
│  + ITEMS        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. TIMESTAMP   │  ← Actualizar last_import_at
│                 │
└─────────────────┘
```

### Detalle por entidad

#### 1. Artículos (articles + article_stock)

```sql
-- Query SQL Server
SELECT ID_MATERIAL, DESCRIPCION, CLASIFICACION, EXISTENCIA, ID_MATERIAL_SEVILLA/JEREZ
FROM dbo.ARTICULO_ALQUILER
WHERE BAJA = 0
```

- **Lógica de unificación**: Si un artículo de Jerez tiene `ID_MATERIAL_SEVILLA`, usa ese ID como `legacy_id` para que ambos warehouses apunten al mismo artículo en Supabase.
- **Upsert**: `ON CONFLICT (legacy_id)` para articles
- **Upsert**: `ON CONFLICT (article_id, warehouse_id)` para stock

#### 2. Clientes (customers)

```sql
-- Query SQL Server (solo SEVILLA)
SELECT ID_CLIENTE, NOMBRE_CLIENTE, TEL1, EMAIL
FROM dbo.CLIENTE
```

- **Filtro**: Excluye clientes internos (IDs 410000, 110000)
- **Upsert**: `ON CONFLICT (legacy_id)`

#### 3. Reservas (rentals + rental_items)

```sql
-- Query SQL Server
SELECT e.ID_EVENTO, e.ID_CLIENTE, e.FECHA_EVENTO, e.FECHA_ENTREGA,
       e.FECHA_RECOLECTA, e.STATUS, e.NOTAS, e.LUGAR_DESCRIPCION,
       ed.ID_MATERIAL, ed.CANTIDAD, ed.NOTAS_ITEM
FROM dbo.EVENTO_ALQUILER e
LEFT JOIN dbo.EVENTO_ALQUILER_DETALLE ed ON e.ID_EVENTO = ed.ID_EVENTO
WHERE e.FECHA_EVENTO >= DATEADD(month, -3, GETDATE())
```

- **Filtro**: Solo eventos de los últimos 3 meses
- **Mapeo**: Convierte `ID_CLIENTE` → `customer_id` (UUID de Supabase)
- **Mapeo**: Convierte `ID_MATERIAL` → `article_id` (UUID de Supabase)
- **Upsert cabeceras**: `ON CONFLICT (legacy_id, warehouse_id)`
- **Items**: DELETE antiguos + INSERT nuevos (reemplazo completo)

#### 4. Timestamp

```sql
-- Supabase
INSERT INTO system_settings (key, value, description)
VALUES ('last_import_at', '2026-02-03T10:00:00Z', 'Timestamp of last successful data import')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
```

---

## Manejo de Errores

### Estrategia de reintentos

| Tipo de error | Acción | Reintentos |
|---------------|--------|------------|
| Conexión SQL Server | Retry con backoff | 3 intentos |
| Conexión Supabase | Retry con backoff | 3 intentos |
| Error en transformación | Log y continuar | - |
| Error en upsert | Abortar entidad | - |
| Error crítico | Abortar todo | - |

### Backoff exponencial

```
Intento 1: espera 1 segundo
Intento 2: espera 2 segundos
Intento 3: espera 4 segundos
```

### Lock file

El servicio usa un lock file (`/tmp/enteza-sync.lock`) para prevenir ejecuciones simultáneas. Si un proceso anterior falló sin liberar el lock:

```bash
rm /tmp/enteza-sync.lock
```

---

## Logs y Monitoreo

### Ubicación de logs

| Archivo | Contenido |
|---------|-----------|
| `/var/log/enteza-sync/sync-YYYY-MM-DD.log` | Logs del proceso de sincronización |
| `/var/log/enteza-sync/cron.log` | Output de cron (stdout/stderr) |

### Formato de logs

Los logs están en formato JSON para fácil parsing:

```json
{
  "level": "info",
  "message": "Articles fetched",
  "timestamp": "2026-02-03 10:00:05",
  "service": "enteza-sync",
  "warehouse": "SEVILLA",
  "count": 1523
}
```

### Comandos útiles de monitoreo

```bash
# Ver logs en tiempo real
tail -f /var/log/enteza-sync/sync-$(date +%Y-%m-%d).log

# Buscar errores
grep '"level":"error"' /var/log/enteza-sync/sync-*.log

# Contar registros sincronizados hoy
grep 'Upserted' /var/log/enteza-sync/sync-$(date +%Y-%m-%d).log

# Ver última ejecución de cron
tail -20 /var/log/enteza-sync/cron.log

# Ver resumen del día
grep 'SYNC SUMMARY' -A 15 /var/log/enteza-sync/cron.log | tail -20
```

### Rotación de logs

Los logs tienen rotación diaria automática (un archivo por día). Para limpiar logs antiguos:

```bash
# Eliminar logs de más de 30 días
find /var/log/enteza-sync -name "sync-*.log" -mtime +30 -delete
```

Puedes agregar esto a cron:

```bash
# Limpieza semanal de logs antiguos
0 0 * * 0 root find /var/log/enteza-sync -name "*.log" -mtime +30 -delete
```

---

## Notificaciones por Email

### Cuándo se envían emails

| Evento | Email |
|--------|-------|
| Conexión fallida (después de reintentos) | ✅ Error alert |
| Error crítico durante sincronización | ✅ Error alert |
| Sincronización con errores parciales | ✅ Warning summary |
| Sincronización exitosa sin problemas | ❌ No se envía |

### Configuración de Gmail

Para usar Gmail como SMTP, necesitas crear un "App Password":

1. Ir a [Google Account Security](https://myaccount.google.com/security)
2. Habilitar "2-Step Verification"
3. Ir a "App passwords"
4. Crear nueva app password para "Mail"
5. Usar esa contraseña en `SMTP_PASSWORD`

### Ejemplo de email de error

```
Subject: [ENTEZA SYNC] Error en sincronizacion - 2026-02-03

Error en Sincronizacion Enteza
------------------------------
Fecha: 2026-02-03T10:00:00Z
Warehouse: SEVILLA

Errores Criticos:
- Connection timeout to SQL Server

Resultados por Entidad:
| Entidad | Estado | Registros | Errores |
|---------|--------|-----------|---------|
| articles-SEVILLA | ERROR | 0 | Connection timeout |
| customers | OK | 3421 | - |
```

---

## Troubleshooting

### Error: "Another sync process is already running"

**Causa**: El proceso anterior no liberó el lock file.

**Solución**:
```bash
rm /tmp/enteza-sync.lock
```

### Error: "Missing required environment variable: XXX"

**Causa**: Falta una variable en `.env`

**Solución**: Verificar que todas las variables están configuradas:
```bash
cat /opt/enteza-sync/.env | grep -v "^#" | grep -v "^$"
```

### Error: "Connection timeout" a SQL Server

**Causa**: No hay conectividad de red al SQL Server

**Solución**:
```bash
# Verificar conectividad
telnet 192.168.1.10 1433

# Verificar firewall
sudo iptables -L -n | grep 1433
```

### Error: "Invalid API key" en Supabase

**Causa**: El `service_role_key` es incorrecto o expiró

**Solución**: Obtener nueva key desde Supabase Dashboard → Settings → API

### Logs no se escriben

**Causa**: Permisos incorrectos en el directorio

**Solución**:
```bash
sudo chown -R $USER:$USER /var/log/enteza-sync
chmod 755 /var/log/enteza-sync
```

### Container no encuentra .env

**Causa**: Path incorrecto al archivo .env

**Solución**: Usar path absoluto:
```bash
docker run --rm --env-file /opt/enteza-sync/.env enteza-sync
```

### Cron no ejecuta

**Causa**: Permisos o formato incorrecto del archivo cron

**Solución**:
```bash
# Verificar permisos
ls -la /etc/cron.d/enteza-sync
# Debe ser: -rw-r--r-- root root

# Verificar formato (sin errores de sintaxis)
sudo crontab -l

# Reiniciar cron
sudo systemctl restart cron

# Ver logs de cron
sudo journalctl -u cron -f
```

---

## Mantenimiento

### Actualizar el servicio

```bash
cd /opt/enteza-sync

# Obtener cambios (si usas git)
git pull

# Reconstruir imagen
docker build -t enteza-sync:latest .

# Probar
docker run --rm --env-file .env enteza-sync --test-connections
```

### Backup de configuración

```bash
# Backup del .env (sin incluir en git)
cp /opt/enteza-sync/.env /opt/enteza-sync/.env.backup.$(date +%Y%m%d)
```

### Ver historial de sincronizaciones

```bash
# Últimas 10 sincronizaciones exitosas
grep "SYNC SUMMARY" /var/log/enteza-sync/cron.log | tail -10

# Sincronizaciones fallidas
grep "Status: FAILED" /var/log/enteza-sync/cron.log
```

### Ejecutar sincronización manual

Si necesitas forzar una sincronización fuera del horario de cron:

```bash
docker run --rm \
  --env-file /opt/enteza-sync/.env \
  -v /var/log/enteza-sync:/app/logs \
  enteza-sync:latest
```

### Deshabilitar temporalmente

```bash
# Comentar las líneas en cron
sudo nano /etc/cron.d/enteza-sync
# Agregar # al inicio de cada línea de cron

# O eliminar el archivo
sudo rm /etc/cron.d/enteza-sync
```

---

## Contacto y Soporte

Para problemas con el servicio:
1. Revisar logs: `/var/log/enteza-sync/`
2. Verificar conectividad a BDs
3. Revisar configuración en `.env`

---

*Documentación actualizada: 2026-02-03*

Probar el Sync Service en local (sin Docker)
1. Instalar dependencias

cd sync
npm install
2. Crear archivo .env

cp .env.example .env
Luego edita sync/.env con tus credenciales reales:

SQL Server Sevilla/Jerez: IPs, usuario, password de tu red interna
Supabase: URL y service_role_key (la misma que tienes en .env.local de la app principal)
Email: Opcional, puedes dejarlo vacio
3. Probar conexiones (no toca datos)

npm run test:connections
Esto verifica que puede conectar a SQL Server Sevilla, Jerez y Supabase. Si alguna falla, sabras exactamente cual.

4. Dry-run (simula sin escribir nada)

npm run sync -- --dry-run --verbose
Esto lee de SQL Server, transforma los datos y te muestra que haria, pero NO escribe nada en Supabase. Ideal para la primera prueba.

5. Sincronizacion real

# Completa (ambos almacenes)
npm run sync

# Solo un almacen
npm run sync -- --warehouse SEVILLA

# Solo maestros (articulos + clientes)
npm run sync:master

# Solo reservas
npm run sync:rentals
Comandos con mas detalle (verbose)
Cualquier comando acepta --verbose para ver logs detallados:


npm run sync -- --warehouse SEVILLA --verbose
Requisito clave: Conectividad a SQL Server
Para que funcione desde tu maquina Windows, necesitas acceso de red al puerto 1433 de los SQL Server de Sevilla y Jerez. Si estas en la misma red (VPN o red local del CPD), deberia funcionar. Si no tienes acceso directo, el sync solo funcionara desde una maquina dentro de esa red.
