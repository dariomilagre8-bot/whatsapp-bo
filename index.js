// index.js — Palanca Bot Engine (LLM-First / Agentic RAG)
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./clients/streamzone/config');
const clientRouter = require('./src/router');
const StateMachine = require('./engine/lib/state-machine');
const { createWebhookHandler } = require('./src/routes/webhook');
const { createWebhookRouter } = require('./engine/middleware/webhook-router');
const { getRedis } = require('./engine/lib/dedup');
const metrics = require('./engine/lib/metrics');
const { reconnectHandler } = require('./src/routes/reconnect');
const { connectBraulioHandler } = require('./src/routes/connect-braulio');
const llm = require('./engine/lib/llm');
const googleSheets = require('./src/integrations/google-sheets');
const supabaseIntegration = require('./src/integrations/supabase');
const { initBilling, handlePaymentConfirmation } = require('./src/billing/reminder');
const { initStockNotifier } = require('./src/stock/stock-notifier');
const { initFollowUp } = require('./src/crm/followup');
const { marcarInactivos } = require('./src/crm/leads');
const { initRenewal } = require('./src/renewal/renewal-cron');

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

// ── Evolution API config (instance overridden por request) ──
const evolutionConfig = {
  apiUrl: process.env.EVOLUTION_API_URL,
  apiKey: process.env.EVOLUTION_API_KEY,
  instance: config.evolutionInstance || process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'Zara-Teste',
};

// ── Registry: instanceName → { config, handler } (multi-tenant) ──
const webhookHandler = createWebhookHandler(config, stateMachine, getInventoryForPrompt, evolutionConfig);
const registry = {
  [config.evolutionInstance]: { config, handler: webhookHandler },
  'Zara-Teste': { config, handler: webhookHandler },
  'Streamzone Braulio': { config, handler: webhookHandler },
};

// Adicionar clientes de src/router.js ao registry (legado)
for (const [, entry] of Object.entries(clientRouter.clientes)) {
  const instName = entry.evolutionInstance;
  if (instName && !registry[instName]) {
    const clientStateMachine = new StateMachine(entry.config);
    const clientEvoConfig = { ...evolutionConfig, instance: instName };
    const clientHandler = createWebhookHandler(entry.config, clientStateMachine, () => Promise.resolve(''), clientEvoConfig);
    registry[instName] = { config: entry.config, handler: clientHandler };
  }
}

// Auto-registo: clients/<slug>/config.js (exceto streamzone — já coberto acima)
(function registerClientsFromDisk() {
  const clientsRoot = path.join(__dirname, 'clients');
  const registered = [];
  for (const dirent of fs.readdirSync(clientsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name === 'streamzone') continue;
    const cfgPath = path.join(clientsRoot, dirent.name, 'config.js');
    if (!fs.existsSync(cfgPath)) continue;
    const clientCfg = require(cfgPath);
    const inst = clientCfg.evolutionInstance;
    if (!inst || !clientCfg.slug) {
      console.warn(`[CLIENTS] Ignorado pasta "${dirent.name}": falta slug ou evolutionInstance`);
      continue;
    }
    if (registry[inst]) {
      console.warn(`[CLIENTS] Ignorado slug=${clientCfg.slug}: instância "${inst}" já no registry`);
      continue;
    }
    const sm = new StateMachine(clientCfg);
    const clientEvoConfig = { ...evolutionConfig, instance: inst };
    const h = createWebhookHandler(clientCfg, sm, () => Promise.resolve(''), clientEvoConfig);
    registry[inst] = { config: clientCfg, handler: h };
    registered.push(`${clientCfg.slug}→${inst}`);
  }
  console.log(registered.length
    ? `✅ Clientes clients/: ${registered.join(' | ')}`
    : '✅ Clientes clients/: (nenhum extra)');
})();

const webhookRouter = createWebhookRouter(registry, getRedis());
app.post('/webhook', webhookRouter);
app.post('/webhook/messages', webhookRouter);
app.post('/webhook/:instanceName', webhookRouter);
app.get('/api/metrics', (req, res) => {
  if (res.headersSent) return;
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metrics.getPrometheusText());
});
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
  if (res.headersSent) return;
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

app.get('/api/health', async (req, res) => {
  const checks = {};
  const start = Date.now();

  // 1. Supabase
  try {
    const sb = supabaseIntegration.getClient();
    if (sb) {
      const { error } = await sb.from('clientes').select('id').limit(1);
      checks.supabase = error ? `error: ${error.message}` : 'ok';
    } else {
      checks.supabase = 'not_configured';
    }
  } catch (e) {
    checks.supabase = `error: ${e.message}`;
  }

  // 2. Google Sheets
  try {
    checks.google_sheets = googleSheets.isReady() ? 'ok' : 'not_initialized';
  } catch (e) {
    checks.google_sheets = `error: ${e.message}`;
  }

  // 3. Evolution API (verifica estado da instância)
  try {
    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    const evoInstance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'default';
    if (evoUrl) {
      const resp = await fetch(`${evoUrl}/instance/connectionState/${evoInstance}`, {
        headers: { 'apikey': evoKey },
        signal: AbortSignal.timeout(5000),
      });
      const data = await resp.json();
      const state = data?.instance?.state || data?.state;
      checks.evolution_api = state === 'open' ? 'ok' : `state: ${state}`;
    } else {
      checks.evolution_api = 'not_configured';
    }
  } catch (e) {
    checks.evolution_api = `error: ${e.message}`;
  }

  checks.uptime_seconds = Math.floor(process.uptime());
  checks.response_ms = Date.now() - start;

  const criticalChecks = ['supabase', 'evolution_api'];
  const allOk = criticalChecks.every(k => checks[k] === 'ok');

  if (res.headersSent) return;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
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
// deploy-check Sun Mar 15 15:15:59 GMT 2026
// deploy-check Sun Mar 15 15:20:12 GMT 2026
