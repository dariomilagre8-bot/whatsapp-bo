// index.js — Palanca Bot Engine (LLM-First / Agentic RAG)
require('dotenv').config();

const express = require('express');
const config = require('./config/streamzone');
const StateMachine = require('./src/engine/state-machine');
const { createWebhookHandler } = require('./src/routes/webhook');
const { reconnectHandler } = require('./src/routes/reconnect');
const { connectBraulioHandler } = require('./src/routes/connect-braulio');
const llm = require('./src/engine/llm');
const googleSheets = require('./src/integrations/google-sheets');
const supabaseIntegration = require('./src/integrations/supabase');
const { initBilling, handlePaymentConfirmation } = require('./src/billing/reminder');
const { initStockNotifier } = require('./src/stock/stock-notifier');
const { initFollowUp } = require('./src/crm/followup');
const { marcarInactivos } = require('./src/crm/leads');
const { initRenewal } = require('./src/renewal/renewal-cron');
const path = require('path');

const app = express();
app.use(express.json());

// ── Init serviços (autenticação mantida) ──
const credPath = path.join(__dirname, 'credentials.json');
if (require('fs').existsSync(credPath)) {
  googleSheets.init(credPath, process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEET_ID || '18YCr1alFpUNnj4NOOFItP3umnSJGsl2oPmGihlxOa0s');
  console.log('✅ Google Sheets inicializado');
}

supabaseIntegration.init(process.env.SUPABASE_URL, process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY);
console.log('✅ Supabase inicializado');

llm.init(process.env.GEMINI_API_KEY);
console.log('✅ Gemini inicializado');

// ── State Machine (apenas para histórico + paused + supervisor) ──
const stateMachine = new StateMachine(config);
setInterval(() => stateMachine.cleanup(), 60 * 60 * 1000);

// ── Inventário para o prompt (cache 60s) ──
let inventoryCache = '';
let inventoryCacheTime = 0;
const INVENTORY_TTL = 60 * 1000;

async function getInventoryForPrompt() {
  const now = Date.now();
  if (now - inventoryCacheTime < INVENTORY_TTL && inventoryCache) return inventoryCache;
  try {
    inventoryCache = await googleSheets.getInventoryForPrompt(config.stock, config.products);
    inventoryCacheTime = now;
  } catch (err) {
    console.error('[INVENTORY] Cache refresh failed:', err.message);
  }
  return inventoryCache || 'Nenhum dado de inventário disponível no momento.';
}

// ── Evolution API config ──
const evolutionConfig = {
  apiUrl: process.env.EVOLUTION_API_URL,
  apiKey: process.env.EVOLUTION_API_KEY,
  instance: process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'Zara-Teste',
};

// ── Routes ──
const webhookHandler = createWebhookHandler(config, stateMachine, getInventoryForPrompt, evolutionConfig);
app.post('/webhook', webhookHandler);
app.get('/reconnect/:instanceId', reconnectHandler);
app.get('/connect/braulio', connectBraulioHandler);

app.get('/health', async (req, res) => {
  const services = { supabase: 'unknown', evolution: 'unknown' };
  let allOk = true;

  // Verificar Supabase
  try {
    const sb = supabaseIntegration.getClient();
    if (sb) {
      const { error } = await sb.from('clientes').select('id').limit(1);
      services.supabase = error ? 'degraded' : 'ok';
    } else {
      services.supabase = 'not_configured';
    }
  } catch {
    services.supabase = 'down';
    allOk = false;
  }

  // Verificar Evolution API
  try {
    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    const evoInstance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'default';
    if (evoUrl) {
      const evoRes = await fetch(`${evoUrl}/instance/connectionState/${evoInstance}`, {
        headers: { 'apikey': evoKey },
      });
      services.evolution = evoRes.ok ? 'ok' : 'degraded';
    } else {
      services.evolution = 'not_configured';
    }
  } catch {
    services.evolution = 'down';
    allOk = false;
  }

  const statusCode = allOk ? 200 : 503;
  res.status(statusCode).json({
    status: allOk ? 'ok' : 'degraded',
    engine: 'Palanca Bot Engine (LLM-First)',
    bot: config.identity.botName,
    business: config.identity.businessName,
    sessions: stateMachine.sessions.size,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services,
  });
});

// ── Billing + Stock Notifier + CRM Follow-up (cron jobs) ──
const sbClient = supabaseIntegration.getClient();
if (sbClient) {
  initBilling(sbClient);
  initStockNotifier(sbClient, config.stock);
  initFollowUp(sbClient);
  initRenewal(config.stock, config.payment, sbClient);

  // Cron semanal: marcar leads inactivos (às 03:00 de segunda-feira)
  const cron = require('node-cron');
  cron.schedule('0 3 * * 1', async () => {
    try { await marcarInactivos(sbClient); } catch (_) {}
  }, { timezone: 'Africa/Luanda' });
}

// ── Start ──
const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`\n🚀 Palanca Bot Engine (LLM-First)`);
  console.log(`🤖 Bot: ${config.identity.botName} (${config.identity.businessName})`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`👑 Supervisores: ${process.env.SUPERVISOR_NUMBERS || process.env.SUPERVISOR_NUMBER || process.env.BOSS_NUMBER || '(não definido)'}`);
  console.log(`💰 Billing: ${process.env.BILLING_ENABLED === 'true' ? 'activado' : 'desactivado'}`);
  console.log(`📦 Stock Notifier: ${process.env.STOCK_NOTIFICATIONS_ENABLED === 'true' ? 'activado' : 'desactivado'}`);
  console.log(`📨 Follow-up CRM: ${process.env.FOLLOWUP_ENABLED === 'true' ? 'activado' : 'desactivado'}`);
  console.log(`🔄 Renovação automática: ${process.env.RENEWAL_ENABLED === 'true' ? 'activado' : 'desactivado'}`);
  console.log(`✅ Pronto!\n`);
});
