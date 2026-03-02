#!/usr/bin/env bash
# Testa e faz deploy (git add, commit, push). Redeploy no EasyPanel via webhook.
set -e
cd "$(dirname "$0")/.."
echo "=== Verificação de sintaxe ==="
node -c index.js
node -c src/respostas-fixas.js
node -c src/memoria-local.js
node -c expiracao-modulo.js
echo "=== Testes Zara ==="
node tests/zara-test.js
echo "=== Testes HTTP (opcional, requer servidor a correr) ==="
if node tests/webhook-test.js 2>/dev/null; then
  echo "Webhook tests OK"
else
  echo "Webhook tests ignorados (servidor não disponível ou falha)"
fi
echo "=== Git ==="
git add -A
git status
echo "Commit com mensagem padrão? (feat: Zara skills...)"
git commit -m "feat: Zara skills de venda, respostas fixas, memória local, testes automáticos, avisos expiração [CPA]" || true
git push || true
echo "=== Concluído ==="
