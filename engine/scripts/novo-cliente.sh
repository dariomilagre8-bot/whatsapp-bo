#!/bin/bash
# engine/scripts/novo-cliente.sh — Interactivo: gera pasta completa em clients/
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

read -p "Slug (ex: kitanda): " SLUG
read -p "Nome bot (ex: Bia): " BOT_NAME
read -p "Nome negócio (ex: Kitanda Virtual): " BUSINESS_NAME
read -p "Nº WhatsApp Business (ex: 244923456789): " WPP_NUMBER
read -p "Nº supervisor (ex: 244912345678): " SUPERVISOR
read -p "Instância Evolution (ex: Kitanda Bia): " INSTANCE

mkdir -p "clients/$SLUG"

sed -e "s/{{SLUG}}/$SLUG/g" -e "s/{{BOT_NAME}}/$BOT_NAME/g" \
    -e "s/{{BUSINESS_NAME}}/$BUSINESS_NAME/g" -e "s/{{WHATSAPP_NUMBER}}/$WPP_NUMBER/g" \
    -e "s/{{SUPERVISOR_NUMBER}}/$SUPERVISOR/g" -e "s/{{EVOLUTION_INSTANCE}}/$INSTANCE/g" \
    engine/templates/config.template.js > "clients/$SLUG/config.js"

cp engine/templates/prompts.template.js "clients/$SLUG/prompts.js"
cp engine/templates/validators.template.js "clients/$SLUG/validators.js"

echo "✅ clients/$SLUG/ criado. Edita config.js, depois npm test && npm run deploy"
