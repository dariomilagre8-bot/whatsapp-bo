#!/bin/bash
# Inicia a Zara em modo TESTE
echo "🧪 A iniciar Zara em modo TESTE..."
echo "⚠️  Tabelas: clientes_teste, vendas_teste, perfis_entregues_teste"
echo "⚠️  Sheet: SDB-Teste (GOOGLE_SHEET_ID em .env.test)"
echo ""

if [ ! -f .env.test ]; then
  echo "❌ Ficheiro .env.test não encontrado."
  echo "   Cria .env.test antes de continuar."
  exit 1
fi

# Carrega variáveis de teste
set -a
source .env.test
set +a

echo "📱 Instância: $EVOLUTION_INSTANCE_NAME"
echo "📞 Número de teste: $SUPERVISOR_NUMBER"
echo ""

# Inicia o servidor
node index.js
