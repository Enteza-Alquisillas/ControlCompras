# Guía de Despliegue en Servidor Debian (CPD)

Esta guía detalla cómo desplegar el servicio de sincronización en la máquina Debian del CPD.

## Opción 1: Despliegue con Docker (Recomendado)

Esta es la opción más limpia ya que no requiere instalar Node.js ni configurar dependencias en el sistema operativo host.

### 1. Preparar archivos
Copia el contenido de la carpeta `sync/` al servidor (excluyendo carpetas locales):
```bash
rsync -avz --exclude 'node_modules' --exclude 'logs' --exclude 'dist' . usuario@ip-debian:/opt/enteza-sync/
```

### 2. Instalación Automática
Ejecuta el script de instalación que configurará Docker y los Cron Jobs:
```bash
cd /opt/enteza-sync
sudo chmod +x scripts/install.sh
sudo ./scripts/install.sh
```

### 3. Verificación
```bash
# Probar conexiones
docker run --rm --env-file .env enteza-sync --test-connections

# Ejecución manual (dry-run)
docker run --rm --env-file .env -v /var/log/enteza-sync:/app/logs enteza-sync --dry-run
```

---

## Opción 2: Despliegue Manual (npm run sync)

### 1. Requisitos
- Node.js 20+
- npm 10+

### 2. Archivos necesarios
Asegúrate de copiar:
- `src/` (Código fuente)
- `package.json` y `package-lock.json`
- `tsconfig.json`
- `.env` (Configurado con las IPs del CPD)

### 3. Instalación y Ejecución
```bash
cd /opt/enteza-sync
npm install
npm run sync
```

---

## Notas de Configuración (.env)
Asegúrate de que el archivo `.env` en el servidor tenga:
- Las IPs correctas de SQL Server Sevilla y Jerez.
- `SUPABASE_SERVICE_ROLE_KEY` correcta.
- `LOG_DIR` configurado como `/app/logs` para Docker o el path local para manual.

## Logs y Monitoreo
Si usaste el script de instalación (`install.sh`), los logs están en:
- `/var/log/enteza-sync/sync-YYYY-MM-DD.log`
- `/var/log/enteza-sync/cron.log` (salida del planificador)
