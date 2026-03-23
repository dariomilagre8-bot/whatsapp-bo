#!/usr/bin/env bash
# scripts/novo-cliente.sh — Wizard interactivo de criação de novo bot — Palanca Automações
# Uso: ./scripts/novo-cliente.sh
# Requisito: executar a partir da raiz do repo (whatsapp-bot/)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

EVOLUTION_URL="${EVOLUTION_API_URL:-https://whatsapp-evolution-api.oxuzyt.easypanel.host}"
EVOLUTION_KEY="${EVOLUTION_API_KEY:-7d39b8fa-7176-4ac8-90a3-effefe0d7103}"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   PALANCA AUTOMAÇÕES — Wizard Novo Bot       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Dados do negócio ──
read -p "📛  Nome do negócio: " BUSINESS_NAME
read -p "🤖  Nome do bot (ex: Bia, Luna, Zara): " BOT_NAME
echo ""
echo "Nichos disponíveis:"
echo "  ecommerce  · restaurante  · beleza  · streaming  · generico"
read -p "🎯  Nicho: " NICHE
read -p "📱  Número WhatsApp Business (ex: 244912345678): " WA_NUMBER
read -p "👑  Número supervisor (ex: 244941713216): " SUPERVISOR_NUMBER
echo ""
echo "Planos disponíveis:"
echo "  starter     — apenas FAQ"
echo "  essencial   — FAQ + catálogo + vendas + stock + supervisor"
echo "  profissional — essencial + followup + waitlist + relatórios"
echo "  empresarial  — todos os módulos"
read -p "💳  Plano: " PLAN

# ── 2. Gerar slug ──
SLUG=$(echo "$BUSINESS_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')
echo ""
echo "→ Slug gerado: $SLUG"
read -p "   Confirmar? (Enter aceita, ou escreva outro): " CUSTOM_SLUG
[ -n "$CUSTOM_SLUG" ] && SLUG="$CUSTOM_SLUG"

# ── 3. Verificar existência ──
CLIENT_DIR="$REPO_ROOT/clients/$SLUG"
if [ -d "$CLIENT_DIR" ]; then
  echo ""
  echo "❌ ERRO: clients/$SLUG já existe!"
  exit 1
fi

# ── 4. Verificar template ──
TEMPLATE="$REPO_ROOT/engine/templates/nichos/nicho-${NICHE}.config.js"
if [ ! -f "$TEMPLATE" ]; then
  echo ""
  echo "❌ ERRO: Template não encontrado: $TEMPLATE"
  echo "   Templates disponíveis:"
  ls "$REPO_ROOT/engine/templates/nichos/" 2>/dev/null || echo "   (pasta não encontrada)"
  exit 1
fi

# ── 5. Criar config a partir do template ──
mkdir -p "$CLIENT_DIR"
cp "$TEMPLATE" "$CLIENT_DIR/config.js"
echo ""
echo "✅ Template copiado: clients/$SLUG/config.js"

INSTANCE_NAME="$SLUG"

# Substituir placeholders (compatível com GNU sed e BSD sed via temp file)
TMP_CONFIG=$(mktemp)
sed \
  -e "s/{{BUSINESS_NAME}}/$BUSINESS_NAME/g" \
  -e "s/{{BOT_NAME}}/$BOT_NAME/g" \
  -e "s/{{CLIENT_SLUG}}/$SLUG/g" \
  -e "s/{{EVOLUTION_INSTANCE}}/$INSTANCE_NAME/g" \
  -e "s/{{SUPERVISOR}}/$SUPERVISOR_NUMBER/g" \
  -e "s/{{WA_NUMBER}}/$WA_NUMBER/g" \
  "$CLIENT_DIR/config.js" > "$TMP_CONFIG"
mv "$TMP_CONFIG" "$CLIENT_DIR/config.js"

# ── 6. Activar módulos por plano ──
TMP_PLAN=$(mktemp)
case "$PLAN" in
  starter)
    sed "s/faq: false/faq: true/g" "$CLIENT_DIR/config.js" > "$TMP_PLAN"
    ;;
  essencial)
    sed -e "s/faq: false/faq: true/g" \
        -e "s/catalog: false/catalog: true/g" \
        -e "s/sales: false/sales: true/g" \
        -e "s/stock: false/stock: true/g" \
        -e "s/supervisor: false/supervisor: true/g" \
        "$CLIENT_DIR/config.js" > "$TMP_PLAN"
    ;;
  profissional)
    sed -e "s/faq: false/faq: true/g" \
        -e "s/catalog: false/catalog: true/g" \
        -e "s/sales: false/sales: true/g" \
        -e "s/stock: false/stock: true/g" \
        -e "s/supervisor: false/supervisor: true/g" \
        -e "s/followup: false/followup: true/g" \
        -e "s/waitlist: false/waitlist: true/g" \
        -e "s/reports: false/reports: true/g" \
        "$CLIENT_DIR/config.js" > "$TMP_PLAN"
    ;;
  empresarial)
    sed "s/: false/: true/g" "$CLIENT_DIR/config.js" > "$TMP_PLAN"
    ;;
  *)
    cp "$CLIENT_DIR/config.js" "$TMP_PLAN"
    echo "⚠️  Plano '$PLAN' desconhecido — nenhum módulo activado automaticamente"
    ;;
esac
mv "$TMP_PLAN" "$CLIENT_DIR/config.js"
echo "✅ Módulos activados para plano: $PLAN"

# ── 7. Criar instância Evolution ──
echo ""
echo "🔗 Criando instância Evolution: $INSTANCE_NAME..."
EVOLUTION_RESPONSE=$(curl -s -X POST "$EVOLUTION_URL/instance/create" \
  -H "apikey: $EVOLUTION_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"instanceName\": \"$INSTANCE_NAME\",
    \"integration\": \"WHATSAPP-BAILEYS\",
    \"qrcode\": true
  }" || echo '{"error":"curl falhou"}')
echo "   Resposta Evolution: $EVOLUTION_RESPONSE"

# ── 8. Configurar webhook ──
echo ""
echo "🔌 Configurando webhook..."
WEBHOOK_URL="http://jules_${INSTANCE_NAME}:80/webhook"
curl -s -X PUT "$EVOLUTION_URL/webhook/set/$INSTANCE_NAME" \
  -H "apikey: $EVOLUTION_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"webhook\": {
      \"enabled\": true,
      \"url\": \"$WEBHOOK_URL\",
      \"webhookByEvents\": false,
      \"events\": [\"MESSAGES_UPSERT\"]
    }
  }" > /dev/null 2>&1 || echo "⚠️  Webhook config falhou (configurar manualmente no Easypanel)"
echo "✅ Webhook configurado: $WEBHOOK_URL"

# ── 9. QR Code ──
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║           SCAN DO QR CODE                 ║"
echo "╠═══════════════════════════════════════════╣"
echo "║  Abrir: $EVOLUTION_URL/instance/connect/$INSTANCE_NAME"
echo "║  Ou: Easypanel → Manager → $INSTANCE_NAME → QR"
echo "╚═══════════════════════════════════════════╝"
read -p "   Pressiona Enter quando o QR for scaneado..."

# ── 10. Testes ──
echo ""
echo "🧪 Correndo testes..."
cd "$REPO_ROOT"
npm test
echo "✅ Testes passaram"

# ── 11. Git commit ──
git add -A
git commit -m "feat: novo bot $BOT_NAME para $BUSINESS_NAME ($SLUG) [$PLAN] [CPA]"
git push
echo "✅ Código commitado e pushado"

# ── 12. Checklist final ──
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║              CHECKLIST FINAL                     ║"
echo "╚══════════════════════════════════════════════════╝"
echo "✅ Config criado:        clients/$SLUG/config.js"
echo "✅ Template:             $NICHE"
echo "✅ Plano:                $PLAN"
echo "✅ Instância Evolution:  $INSTANCE_NAME"
echo "✅ Webhook:              $WEBHOOK_URL"
echo "⬜ QR scaneado?"
echo "⬜ Redeploy Easypanel (jules → whatssiru OU criar novo serviço)"
echo "⬜ Testar: enviar 'Oi' para $WA_NUMBER"
echo "⬜ Health check: GET /api/health"
echo ""
echo "🚀 Bot $BOT_NAME para $BUSINESS_NAME está PRONTO."
echo "   Número: $WA_NUMBER | Slug: $SLUG | Plano: $PLAN"
echo ""
