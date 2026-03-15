#!/bin/bash
# scripts/deploy.sh — Deploy automático para Hetzner/Easypanel
set -e

SERVER="root@46.224.99.52"
REMOTE_PATH="/etc/easypanel/projects/jules/whatssiru/code"
SERVICE="jules_whatssiru"

echo "🔍 A correr testes..."
npm test
if [ $? -ne 0 ]; then
    echo "❌ Testes falharam. Deploy cancelado."
    exit 1
fi

echo "📦 A sincronizar ficheiros..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude 'credentials.json' \
    --exclude 'deploys' \
    --exclude 'backups' \
    ./ ${SERVER}:${REMOTE_PATH}/

echo "🔨 A rebuildar Docker (sem cache)..."
ssh ${SERVER} "cd ${REMOTE_PATH} && docker build --no-cache -t easypanel/jules/whatssiru:latest ."

echo "🔄 A relançar serviço..."
ssh ${SERVER} "docker service scale ${SERVICE}=0 && sleep 10 && docker service scale ${SERVICE}=1"

echo "⏳ A aguardar arranque (30s)..."
sleep 30

echo "✅ A verificar..."
ssh ${SERVER} "docker exec \$(docker ps -q --filter 'name=whatssiru') node -e 'console.log(\"health: ok\")'"

echo "🚀 Deploy concluído!"
