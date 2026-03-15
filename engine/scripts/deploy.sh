#!/bin/bash
# engine/scripts/deploy.sh — Deploy parametrizado: SERVER_IP, SERVICE_NAME via .env
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

SERVER_IP="${SERVER_IP:-$(grep SERVER_IP .env 2>/dev/null | cut -d= -f2)}"
SERVICE_NAME="${SERVICE_NAME:-$(grep EASYPANEL_SERVICE .env 2>/dev/null | cut -d= -f2)}"
PROJECT_NAME="${PROJECT_NAME:-$(grep EASYPANEL_PROJECT .env 2>/dev/null | cut -d= -f2)}"

if [[ -z "$SERVER_IP" ]]; then
  echo "Defina SERVER_IP no .env ou na variável de ambiente."
  exit 1
fi

echo "🧪 Testes..."
npm test || exit 1

echo "📦 Sync..."
rsync -avz --delete --exclude=node_modules --exclude=.git --exclude=.env --exclude=backups \
  ./ root@${SERVER_IP}:/etc/easypanel/projects/${PROJECT_NAME:-jules}/volumes/${SERVICE_NAME:-whatssiru}/code/

echo "🐳 Rebuild..."
ssh root@${SERVER_IP} "cd /etc/easypanel && docker compose up -d --build --force-recreate ${SERVICE_NAME:-whatssiru}"

sleep 30
HEALTH=$(curl -sf "http://${SERVER_IP}:3000/api/health" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).status)}catch(e){console.log('error')}})" 2>/dev/null || echo "error")
[[ "$HEALTH" = "ok" || "$HEALTH" = "degraded" ]] || { echo "❌ Health: $HEALTH"; exit 1; }
echo "🚀 Deploy OK!"
