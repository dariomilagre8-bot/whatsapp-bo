#!/usr/bin/env node
// scripts/registar-webhook.js — Regista o webhook da instância Streamzone Braulio na Evolution API
// Uso: node scripts/registar-webhook.js
// Requer: .env com EVOLUTION_API_URL e EVOLUTION_API_KEY

require('dotenv').config();

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = 'Streamzone Braulio';
const WEBHOOK_URL = 'https://whatssiru.46.224.99.52.nip.io/webhook';

if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
  console.error('Erro: EVOLUTION_API_URL e EVOLUTION_API_KEY são obrigatórios no .env');
  process.exit(1);
}

// Algumas versões Evolution esperam webhook aninhado
const body = {
  webhook: {
    url: WEBHOOK_URL,
    enabled: true,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
  },
};

const instanceEnc = encodeURIComponent(INSTANCE);
const url = `${EVOLUTION_API_URL}/webhook/set/${instanceEnc}`;

async function main() {
  console.log(`A registar webhook para instância "${INSTANCE}"...`);
  console.log(`URL: ${WEBHOOK_URL}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (res.ok) {
    console.log(`✅ Webhook registado (HTTP ${res.status})`);
    if (json) console.log(JSON.stringify(json, null, 2));
  } else {
    console.error(`❌ Falha: HTTP ${res.status}`);
    console.error(text);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
