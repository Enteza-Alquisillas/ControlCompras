#!/bin/bash
# ===========================================
# Enteza Sync - Installation Script for Linux
# ===========================================

set -e

INSTALL_DIR="/opt/enteza-sync"
LOG_DIR="/var/log/enteza-sync"
CRON_FILE="/etc/cron.d/enteza-sync"

echo "=== Enteza Sync Installation ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root or with sudo"
    exit 1
fi

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

# Copy files
echo "Copying files..."
cp -r . "$INSTALL_DIR/"

# Check for .env file
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo ""
    echo "WARNING: .env file not found!"
    echo "Copy .env.example to .env and configure it:"
    echo "  cp $INSTALL_DIR/.env.example $INSTALL_DIR/.env"
    echo "  nano $INSTALL_DIR/.env"
    echo ""
fi

# Build Docker image
echo "Building Docker image..."
cd "$INSTALL_DIR"
docker build -t enteza-sync:latest .

# Install cron job
echo "Installing cron jobs..."
cat > "$CRON_FILE" << 'EOF'
# Enteza Sync - Automatic data synchronization
#
# Sincronización completa: Lun-Vie a las 07, 09, 12, 14 y 16 horas
0 7,9,12,14,16 * * 1-5 root docker run --rm --env-file /opt/enteza-sync/.env -v /var/log/enteza-sync:/app/logs enteza-sync >> /var/log/enteza-sync/cron.log 2>&1

# Sincronización de maestros (artículos + clientes) una vez al día a las 6am (opcional/backup)
0 6 * * * root docker run --rm --env-file /opt/enteza-sync/.env -v /var/log/enteza-sync:/app/logs enteza-sync --only masters >> /var/log/enteza-sync/cron.log 2>&1
EOF

chmod 644 "$CRON_FILE"

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "1. Configure .env file: nano $INSTALL_DIR/.env"
echo "2. Test connections: docker run --rm --env-file $INSTALL_DIR/.env enteza-sync --test-connections"
echo "3. Run manual sync: docker run --rm --env-file $INSTALL_DIR/.env -v $LOG_DIR:/app/logs enteza-sync --dry-run"
echo ""
echo "Cron jobs installed in: $CRON_FILE"
echo "Logs available at: $LOG_DIR"
echo ""
