#!/bin/bash
# scripts/backup-env.sh — Backup de .env e configs do servidor
set -e

SERVER="root@46.224.99.52"
REMOTE_PATH="/etc/easypanel/projects/jules/whatssiru/code"
BACKUP_DIR="./backups/$(date +%Y-%m-%d_%H%M)"

mkdir -p ${BACKUP_DIR}

echo "📥 A fazer backup do .env..."
scp ${SERVER}:${REMOTE_PATH}/.env ${BACKUP_DIR}/.env

echo "📥 A fazer backup do credentials.json..."
scp ${SERVER}:${REMOTE_PATH}/credentials.json ${BACKUP_DIR}/credentials.json 2>/dev/null || echo "⚠️  credentials.json não encontrado no servidor"

echo "📥 A fazer backup das variáveis de ambiente do container..."
ssh ${SERVER} "docker exec \$(docker ps -q --filter 'name=whatssiru') env" > ${BACKUP_DIR}/container-env.txt 2>/dev/null || echo "⚠️  Container não está a correr — variáveis não guardadas"

echo "✅ Backup guardado em ${BACKUP_DIR}/"
ls -la ${BACKUP_DIR}/
