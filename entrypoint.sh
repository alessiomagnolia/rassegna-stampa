#!/bin/sh
set -e

# Target directory for persistent storage (Render default is /var/data)
TARGET_DIR="${DATA_DIR:-/var/data}"

# If persistent directory exists (mounted by Render or Docker volume), ensure pptruser has write permissions
if [ -d "$TARGET_DIR" ]; then
    echo "[ENTRYPOINT] Rilevato volume persistente in $TARGET_DIR, configurazione permessi..."
    chown -R pptruser:pptruser "$TARGET_DIR" 2>/dev/null || chmod -R 777 "$TARGET_DIR" 2>/dev/null || true
fi

# Ensure local directories are writable for pptruser
mkdir -p /usr/src/app/uploads /usr/src/app/output /usr/src/app/database
chown -R pptruser:pptruser /usr/src/app/uploads /usr/src/app/output /usr/src/app/database 2>/dev/null || true

# Execute command as pptruser using gosu
if [ "$(id -u)" = "0" ]; then
    exec gosu pptruser "$@"
else
    exec "$@"
fi
