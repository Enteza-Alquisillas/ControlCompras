# Enteza Sync

Servicio Node.js independiente que sincroniza SQL Server de Sevilla y Jerez con
Supabase. Se ejecuta desde el CPD o cualquier red con acceso a los dos orígenes.
No depende de la aplicación Next.js.

## Configuración

Crea `sync/.env` con:

```text
SEVILLA_SQL_SERVER=...
SEVILLA_SQL_DATABASE=...
SEVILLA_SQL_USER=...
SEVILLA_SQL_PASSWORD=...
JEREZ_SQL_SERVER=...
JEREZ_SQL_DATABASE=...
JEREZ_SQL_USER=...
JEREZ_SQL_PASSWORD=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
LOG_LEVEL=info
LOG_DIR=./logs
```

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_EMAIL_TO` y
`ALERT_EMAIL_FROM` son opcionales para notificaciones. No existe un
`sync/.env.example` versionado: crea el archivo desde esta lista o desde el
gestor de secretos del entorno.

## Ejecución local

```bash
npm install
npm run test:connections
npm run sync -- --dry-run --verbose
npm run sync
```

Variantes:

```bash
npm run sync -- --warehouse SEVILLA
npm run sync -- --warehouse JEREZ
npm run sync:master
npm run sync:rentals
npm run sync:backfill-vat
npm run sync:backfill-vat:apply
npm run typecheck
```

`sync:backfill-vat` es simulación. Su variante `:apply` únicamente rellena
`customers.vat` que siga nulo tras validar identidad legacy, nombre normalizado
y NIF/CIF no conflictivo entre los dos orígenes.

## Flujo de datos

1. Artículos activos de `ARTICULO_ALQUILER` se unifican y actualizan en
   `articles` y `article_stock`.
2. Clientes de Sevilla se usan como maestro para `customers`; se excluyen los
   internos por ID y nombre.
3. Reservas `VIGENTE` de los últimos tres meses se sincronizan por almacén en
   `rentals` y `rental_items`.
4. Las reservas que ya no están vigentes dentro de la ventana se eliminan del
   espejo. Las líneas se sustituyen en cada sincronización.
5. Cada almacén actualiza su propia marca de última importación solo si terminó
   correctamente.

Garantías del sincronizador:

- **Freno de borrado**: el paso 4 aborta sin borrar nada si eliminaría más de
  `max(50, 10 % de las reservas de la ventana)`. Un volumen así indica una
  comparación rota (por ejemplo, ID `bigint` de SQL Server que `mssql` entrega
  como texto), no cancelaciones reales.
- **Stock a cero explícito**: el stock 0 se escribe en `article_stock`; no se
  omite al sincronizar el estado actual.
- **Mapeos duplicados**: si dos artículos de Jerez apuntan al mismo artículo de
  Sevilla, se omite el duplicado y el resto del lote continúa.
- SQL Server es de solo lectura para este servicio; no se escribe nada allí.

El proceso usa un lock para evitar ejecuciones simultáneas. Un fallo de una
entidad se informa en el resumen y por correo si SMTP está configurado.

## Docker y cron en CPD

Desde `sync/`, construye y prueba la imagen:

```bash
docker build -t enteza-sync:latest .
docker run --rm --env-file .env enteza-sync --test-connections
docker run --rm --env-file .env -v /var/log/enteza-sync:/app/logs enteza-sync --dry-run
```

En Debian, copia el directorio `sync/`, prepara `.env` y ejecuta:

```bash
sudo chmod +x scripts/install.sh
sudo ./scripts/install.sh
```

El instalador crea `/etc/cron.d/enteza-sync` con sincronización completa de
lunes a viernes a las 07:00, 09:00, 12:00, 14:00 y 16:00, además de maestros a
las 06:00. Comprueba la programación y los logs con:

```bash
cat /etc/cron.d/enteza-sync
tail -f /var/log/enteza-sync/cron.log
tail -f /var/log/enteza-sync/sync-$(date +%F).log
```

## Redespliegue en el CPD

El cron usa la imagen local `enteza-sync:latest`; subir código a GitHub no la
actualiza. Tras cambiar `sync/`, en el servidor Debian:

1. Copia el directorio `sync/` actualizado a `/opt/enteza-sync/` sin tocar
   `/opt/enteza-sync/.env` (no se versiona).
2. Reconstruye: `cd /opt/enteza-sync && docker build -t enteza-sync:latest .`
3. Comprueba conexiones: `docker run --rm --env-file .env enteza-sync --test-connections`
4. Simula primero cada almacén:
   `docker run --rm --env-file .env enteza-sync --dry-run --warehouse JEREZ`
   (y `SEVILLA`). La simulación **no ejecuta los borrados**: confía en el freno
   de borrado de arriba y revisa el log buscando `deleteNonVigenteRentals`.
5. Lanza una vez a mano `docker run --rm --env-file .env -v /var/log/enteza-sync:/app/logs enteza-sync --warehouse JEREZ`
   y revisa `sync-AAAA-MM-DD.log` antes de dejar que siga el cron. Si aparece
   `deleteNonVigenteRentals aborted`, no se borró nada: investiga la comparación.
6. El cron no necesita reinstalarse (`/etc/cron.d/enteza-sync` ya apunta a la
   imagen); `scripts/install.sh` solo hace falta en una máquina nueva.

Mientras no se redespliegue, la imagen antigua sigue activa sin los arreglos de
arriba.
