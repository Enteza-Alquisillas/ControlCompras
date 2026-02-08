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

### 4. Limpieza Post-Instalación (Seguridad)
Una vez que la imagen Docker está construida (`enteza-sync:latest`), el código fuente ya está empaquetado dentro de la imagen. Puedes borrar el código fuente del servidor para mayor seguridad, dejando solo el archivo de configuración:

```bash
# Entrar en la carpeta
cd /opt/enteza-sync

# Borrar TODO excepto el archivo .env
sudo find . -maxdepth 1 ! -name '.env' ! -name '.' -exec rm -rf {} +
```

Al borrar esto, el sistema seguirá funcionando porque el **Cron Job** llama directamente a la imagen de Docker y solo necesita el `.env` para las credenciales.

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

## Monitoreo y Verificación del Cron

Si usaste el script de instalación (`install.sh`), puedes verificar que la programación es correcta:

### 1. Ver la programación actual
```bash
cat /etc/cron.d/enteza-sync
```
Deberías ver la línea: `0 7,9,12,14,16 * * 1-5 ...`

### 2. Ver si el proceso se disparó (Logs de Cron)
```bash
# Ver las últimas ejecuciones registradas por el sistema
grep "enteza-sync" /var/log/syslog
# O ver el log específico del proyecto
tail -f /var/log/enteza-sync/cron.log
```

### 3. Ver logs de sincronización
Los logs detallados de qué registros se importaron están aquí:
- `/var/log/enteza-sync/sync-YYYY-MM-DD.log`
