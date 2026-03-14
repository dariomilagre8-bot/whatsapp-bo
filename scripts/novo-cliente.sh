#!/usr/bin/env bash
# scripts/novo-cliente.sh — Deploy rápido de novo cliente Palanca Bot Engine
# Uso: ./scripts/novo-cliente.sh --nome "..." --instancia "..." --numero "..." ...

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/deploys"

# Defaults (podem ser overriden por env ou args)
EVOLUTION_URL="${EVOLUTION_API_URL:-}"
EVOLUTION_KEY="${EVOLUTION_API_KEY:-}"
WEBHOOK_BASE_URL="${WEBHOOK_BASE_URL:-}"

usage() {
  echo "Uso: $0 \\"
  echo "  --nome \"Nome do Cliente\" \\"
  echo "  --instancia \"Nome da Instância Evolution\" \\"
  echo "  --numero \"244XXXXXXXXX\" \\"
  echo "  --gemini-key \"GEMINI_KEY\" \\"
  echo "  --supabase-url \"SUPABASE_URL\" \\"
  echo "  --supabase-key \"SUPABASE_KEY\" \\"
  echo "  --sheets-id \"SHEETS_ID\" \\"
  echo "  [--sheets-credentials \"path/to/credentials.json\"] \\"
  echo "  [--evolution-url \"EVOLUTION_API_URL\"] \\"
  echo "  [--evolution-key \"EVOLUTION_API_KEY\"] \\"
  echo "  [--webhook-url \"https://seu-bot.exemplo.com\"] \\"
  echo "  [--output-dir \"dir/para/env_e_docker\"]"
  echo ""
  echo "Se --evolution-url, --evolution-key e --webhook-url forem passados, regista o webhook na Evolution API."
  echo "Se --output-dir for omitido, usa: $OUTPUT_DIR/<instancia_sanitizada>/"
  exit 1
}

NOME=""
INSTANCIA=""
NUMERO=""
GEMINI_KEY=""
SUPABASE_URL=""
SUPABASE_KEY=""
SHEETS_ID=""
SHEETS_CREDENTIALS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --nome)           NOME="$2"; shift 2 ;;
    --instancia)      INSTANCIA="$2"; shift 2 ;;
    --numero)         NUMERO="$2"; shift 2 ;;
    --gemini-key)     GEMINI_KEY="$2"; shift 2 ;;
    --supabase-url)   SUPABASE_URL="$2"; shift 2 ;;
    --supabase-key)   SUPABASE_KEY="$2"; shift 2 ;;
    --sheets-id)      SHEETS_ID="$2"; shift 2 ;;
    --sheets-credentials) SHEETS_CREDENTIALS="$2"; shift 2 ;;
    --evolution-url)  EVOLUTION_URL="$2"; shift 2 ;;
    --evolution-key)  EVOLUTION_KEY="$2"; shift 2 ;;
    --webhook-url)    WEBHOOK_BASE_URL="$2"; shift 2 ;;
    --output-dir)     OUTPUT_DIR="$2"; shift 2 ;;
    -h|--help)        usage ;;
    *)                echo "Opção desconhecida: $1"; usage ;;
  esac
done

if [[ -z "$NOME" || -z "$INSTANCIA" || -z "$NUMERO" || -z "$GEMINI_KEY" || -z "$SUPABASE_URL" || -z "$SUPABASE_KEY" || -z "$SHEETS_ID" ]]; then
  echo "Faltam parâmetros obrigatórios."
  usage
fi

# Sanitizar nome da instância para pasta (sem espaços)
INSTANCIA_SLUG="${INSTANCIA// /-}"
INSTANCIA_SLUG="${INSTANCIA_SLUG//[^a-zA-Z0-9-]/}"
CLIENT_DIR="$OUTPUT_DIR/$INSTANCIA_SLUG"
mkdir -p "$CLIENT_DIR"

# 1) Gerar .env a partir do template
ENV_TEMPLATE="$REPO_ROOT/.env.template"
ENV_OUT="$CLIENT_DIR/.env"
if [[ ! -f "$ENV_TEMPLATE" ]]; then
  echo "Erro: .env.template não encontrado em $ENV_TEMPLATE"
  exit 1
fi

# Valores para substituição (evolution url/key podem vir do .env existente se não passados)
EV_URL="${EVOLUTION_URL:-{{EVOLUTION_URL}}}"
EV_KEY="${EVOLUTION_KEY:-{{EVOLUTION_KEY}}}"
sed -e "s|{{INSTANCIA}}|$INSTANCIA|g" \
    -e "s|{{EVOLUTION_URL}}|$EV_URL|g" \
    -e "s|{{EVOLUTION_KEY}}|$EV_KEY|g" \
    -e "s|{{GEMINI_KEY}}|$GEMINI_KEY|g" \
    -e "s|{{SUPABASE_URL}}|$SUPABASE_URL|g" \
    -e "s|{{SUPABASE_KEY}}|$SUPABASE_KEY|g" \
    -e "s|{{SHEETS_ID}}|$SHEETS_ID|g" \
    -e "s|{{NOME}}|$NOME|g" \
    -e "s|{{NUMERO}}|$NUMERO|g" \
    "$ENV_TEMPLATE" > "$ENV_OUT"
echo "✅ .env criado: $ENV_OUT"

# 2) Copiar credentials.json se indicado
if [[ -n "$SHEETS_CREDENTIALS" && -f "$SHEETS_CREDENTIALS" ]]; then
  cp "$SHEETS_CREDENTIALS" "$CLIENT_DIR/credentials.json"
  echo "✅ credentials.json copiado para $CLIENT_DIR/"
else
  echo "⚠️  Não foi passado --sheets-credentials ou ficheiro não existe. Coloque credentials.json em $CLIENT_DIR antes do deploy."
fi

# 3) Gerar docker-compose.yml para deploy
COMPOSE_FILE="$CLIENT_DIR/docker-compose.yml"
cat > "$COMPOSE_FILE" << COMPOSE
# Palanca Bot Engine — $NOME ($INSTANCIA)
# Gerado por scripts/novo-cliente.sh — deploy: docker compose up -d

services:
  bot:
    build:
      context: $REPO_ROOT
      dockerfile: Dockerfile
    image: palanca-bot-${INSTANCIA_SLUG}:latest
    container_name: palanca-bot-${INSTANCIA_SLUG}
    restart: unless-stopped
    env_file: .env
    environment:
      - NODE_ENV=production
    ports:
      - "80:80"
COMPOSE
echo "✅ docker-compose.yml criado: $COMPOSE_FILE"

# 4) Registar webhook na Evolution API (se URL e keys disponíveis)
WEBHOOK_ENDPOINT="${WEBHOOK_BASE_URL%/}/webhook"
if [[ -n "$EVOLUTION_URL" && -n "$EVOLUTION_KEY" && -n "$WEBHOOK_BASE_URL" ]]; then
  EVOLUTION_URL_NOSLASH="${EVOLUTION_URL%/}"
  echo "A registar webhook na Evolution API para instância: $INSTANCIA"
  BODY=$(cat << EOF
{
  "url": "$WEBHOOK_ENDPOINT",
  "enabled": true,
  "webhookByEvents": false,
  "webhookBase64": false,
  "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
}
EOF
)
  # Encoding da instância para URL (espaços -> %20)
  INSTANCE_ENC="${INSTANCIA// /%20}"
  INSTANCE_ENC=$(echo "$INSTANCE_ENC" | sed 's/:/%3A/g; s/\//%2F/g')
  if RESP=$(curl -s -w "\n%{http_code}" -X POST "${EVOLUTION_URL_NOSLASH}/webhook/set/${INSTANCE_ENC}" \
    -H "Content-Type: application/json" \
    -H "apikey: $EVOLUTION_KEY" \
    -d "$BODY" 2>/dev/null); then
    HTTP_CODE=$(echo "$RESP" | tail -n1)
    if [[ "$HTTP_CODE" =~ ^(200|201)$ ]]; then
      echo "✅ Webhook registado: $WEBHOOK_ENDPOINT"
    else
      echo "⚠️  Resposta Evolution API: HTTP $HTTP_CODE"
      echo "$RESP" | head -n -1
    fi
  else
    echo "⚠️  Falha ao chamar Evolution API (curl). Registe o webhook manualmente."
  fi
else
  echo "⚠️  Para registar webhook automaticamente, passe --evolution-url, --evolution-key e --webhook-url."
fi

# 5) Imprimir resumo e comandos
RECONNECT_ENC="${INSTANCIA// /%20}"
RECONNECT_PATH="/reconnect/$RECONNECT_ENC"
echo ""
echo "────────────────────────────────────────────────────────────"
echo "  Cliente: $NOME | Instância: $INSTANCIA"
echo "────────────────────────────────────────────────────────────"
echo "  Pasta do deploy: $CLIENT_DIR"
echo "  .env: $ENV_OUT"
echo "  docker-compose: $COMPOSE_FILE"
echo ""
echo "  Link de reconexão (QR Code):"
if [[ -n "$WEBHOOK_BASE_URL" ]]; then
  echo "    ${WEBHOOK_BASE_URL%/}${RECONNECT_PATH}"
else
  echo "    https://SEU_DOMINIO${RECONNECT_PATH}"
fi
echo ""
echo "  Comandos para verificar:"
echo "    cd $CLIENT_DIR"
echo "    docker compose up -d"
echo "    curl -s ${WEBHOOK_BASE_URL:-https://SEU_DOMINIO}/health | jq"
echo "    # Na Evolution API: verificar que o webhook está apontando para o bot."
echo "────────────────────────────────────────────────────────────"
