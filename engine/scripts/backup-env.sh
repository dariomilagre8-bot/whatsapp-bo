#!/bin/bash
# engine/scripts/backup-env.sh — FIX BUG-046: Easypanel injecta env vars no container (não ficheiro .env)
# Obtém variáveis do container em execução e guarda em backups/
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

SERVER_IP="${SERVER_IP:-$(grep SERVER_IP .env 2>/dev/null | cut -d= -f2)}"
SERVICE_NAME="${SERVICE_NAME:-$(grep EASYPANEL_SERVICE .env 2>/dev/null | cut -d= -f2)}"
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

if [[ -z "$SERVER_IP" || -z "$SERVICE_NAME" ]]; then
  echo "Defina SERVER_IP e SERVICE_NAME (ou EASYPANEL_SERVICE) no .env."
  exit 1
fi

ssh root@${SERVER_IP} "docker exec \$(docker ps -q --filter 'name=${SERVICE_NAME}') env" 2>/dev/null \
  | grep -v '^PATH=\|^HOME=\|^HOSTNAME=\|^PWD=\|^SHLVL=\|^_=' \
  | sort > "$BACKUP_DIR/env-backup-$(date +%Y%m%d-%H%M%S).txt" || { echo "⚠️ Container não está a correr ou nome incorreto."; exit 1; }

chmod 600 "$BACKUP_DIR"/env-backup-*.txt 2>/dev/null
ls -t "$BACKUP_DIR"/env-backup-*.txt 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true
echo "✅ Backup OK: $BACKUP_DIR/env-backup-*.txt"
