// index.js — Palanca Bot Engine (LLM-First / Agentic RAG)
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const loadClientConfig = require('./config/load-client');
const streamzoneConfig = require('./clients/streamzone/config');
const config = loadClientConfig();
const clientRouter = require('./src/router');
const StateMachine = require('./engine/lib/state-machine');
const { createWebhookHandler } = require('./src/routes/webhook');
const { createWebhookRouter } = require('./engine/middleware/webhook-router');
const { getRedis } = require('./engine/lib/dedup');
const { getHealth } = require('./engine/lib/health');
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

// ── Inventário para o prompt (cache 60s por cliente) ──
const INVENTORY_TTL = 60 * 1000;
const inventorySlots = new Map();

function evolutionConfigWithInstance(inst) {
  return {
    apiUrl: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: inst || process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'Zara-Teste',
  };
}

function makeInventoryGetter(clientCfg) {
  return async function getInventoryForPrompt() {
    if (!clientCfg.stock || !clientCfg.products) {
      return '';
    }
    const key = clientCfg.slug || 'default';
    let slot = inventorySlots.get(key);
    if (!slot) {
      slot = { cache: '', time: 0 };
      inventorySlots.set(key, slot);
    }
    const now = Date.now();
    if (now - slot.time < INVENTORY_TTL && slot.cache) return slot.cache;
    try {
      slot.cache = await googleSheets.getInventoryForPrompt(clientCfg.stock, clientCfg.products);
      slot.time = now;
    } catch (err) {
      console.error(`[INVENTORY] ${key} cache refresh failed:`, err.message);
    }
    return slot.cache || 'Nenhum dado de inventário disponível no momento.';
  };
}

const primaryInst = config.evolutionInstance || process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'Zara-Teste';
const evolutionConfig = evolutionConfigWithInstance(primaryInst);
const getInventoryPrimary = makeInventoryGetter(config);

// ── Registry: instanceName → { config, handler } (multi-tenant) ──
const registry = {};
const webhookHandler = createWebhookHandler(config, stateMachine, getInventoryPrimary, evolutionConfig);
registry[primaryInst] = { config, handler: webhookHandler };

if (config.slug === 'streamzone') {
  registry['Zara-Teste'] = registry[primaryInst];
  registry['Streamzone Braulio'] = registry[primaryInst];
} else {
  const sz = streamzoneConfig;
  const szInst = sz.evolutionInstance || process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'Streamzone Braulio';
  if (!registry[szInst]) {
    const szSm = new StateMachine(sz);
    const szEvo = evolutionConfigWithInstance(szInst);
    const szHandler = createWebhookHandler(sz, szSm, makeInventoryGetter(sz), szEvo);
    registry[szInst] = { config: sz, handler: szHandler };
  }
  if (!registry['Zara-Teste']) registry['Zara-Teste'] = registry[szInst];
  if (!registry['Streamzone Braulio']) registry['Streamzone Braulio'] = registry[szInst];
}

// Adicionar clientes de src/router.js ao registry (legado)
for (const [, entry] of Object.entries(clientRouter.clientes)) {
  const instName = entry.evolutionInstance;
  if (instName && !registry[instName]) {
    const clientStateMachine = new StateMachine(entry.config);
    const clientEvoConfig = evolutionConfigWithInstance(instName);
    const clientHandler = createWebhookHandler(entry.config, clientStateMachine, () => Promise.resolve(''), clientEvoConfig);
    registry[instName] = { config: entry.config, handler: clientHandler };
  }
}

// Auto-registo: clients/<slug>/config.js (exceto streamzone e o cliente primário já carregado)
(function registerClientsFromDisk() {
  const clientsRoot = path.join(__dirname, 'clients');
  const registered = [];
  for (const dirent of fs.readdirSync(clientsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name === 'streamzone' || dirent.name === config.slug) continue;
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
    const clientEvoConfig = evolutionConfigWithInstance(inst);
    const invFn = clientCfg.slug === 'streamzone' ? makeInventoryGetter(clientCfg) : () => Promise.resolve('');
    const h = createWebhookHandler(clientCfg, sm, invFn, clientEvoConfig);
    registry[inst] = { config: clientCfg, handler: h };
    registered.push(`${clientCfg.slug}→${inst}`);
  }
  console.log(registered.length
    ? `✅ Clientes clients/: ${registered.join(' | ')}`
    : '✅ Clientes clients/: (nenhum extra)');
})();

// ── BullMQ: inicializar queue e worker se REDIS_URL disponível ──
let paMessageQueue = null;
try {
  if (process.env.REDIS_URL) {
    const { createQueue, createWorker } = require('./engine/queue/messageQueue');
    paMessageQueue = createQueue();
    createWorker(registry);
    console.log('✅ BullMQ queue + worker iniciados (pa-messages)');
  } else {
    console.warn('⚠️  REDIS_URL não definido — webhook processado inline (sem queue)');
  }
} catch (queueErr) {
  console.error('[QUEUE] Falha ao iniciar BullMQ:', queueErr.message, '— modo inline activado');
}

const webhookRouter = createWebhookRouter(registry, getRedis(), paMessageQueue);

// Middleware para registar actividade no watchdog (tracking inactividade)
function webhookActivityMiddleware(req, res, next) {
  const instanceName = req.body?.instance || req.params?.instanceName;
  if (instanceName && registry[instanceName]) {
    const slug = registry[instanceName].config?.slug || registry[instanceName].config?.clientSlug;
    if (slug) watchdog.recordMessage(slug);
  }
  next();
}

app.post('/webhook', webhookActivityMiddleware, webhookRouter);
app.post('/webhook/messages', webhookActivityMiddleware, webhookRouter);
app.post('/webhook/:instanceName', webhookActivityMiddleware, webhookRouter);
app.get('/api/metrics', (req, res) => {
  if (res.headersSent) return;
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metrics.getPrometheusText());
});
app.get('/reconnect/:instanceId', reconnectHandler);
app.get('/connect/braulio', connectBraulioHandler);

app.get('/ready', async (req, res) => {
  const { getReadyStatus } = require('./engine/health/readyCheck');
  const { getWorker } = require('./engine/queue/messageQueue');
  const result = await getReadyStatus(getWorker);
  const statusCode = result.status === 'ok' ? 200 : 503;
  if (res.headersSent) return;
  res.status(statusCode).json(result);
});

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
  try {
    const evoInstance =
      config.evolutionInstance
      || process.env.EVOLUTION_INSTANCE
      || process.env.EVOLUTION_INSTANCE_NAME
      || 'default';
    const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const health = await getHealth({
      evolutionUrl: process.env.EVOLUTION_API_URL,
      apiKey: process.env.EVOLUTION_API_KEY,
      instanceName: evoInstance,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey,
      redisClient: getRedis() || null,
      clientConfig: config,
    });
    const httpCode = health.status === 'unhealthy' ? 503 : 200;
    if (res.headersSent) return;
    res.status(httpCode).json(health);
  } catch (e) {
    if (res.headersSent) return;
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// ── Watchdog autónomo (health + auto-recovery + alertas) ──
const { Watchdog } = require('./engine/lib/watchdog');
const sender = require('./engine/lib/sender');

const watchdog = new Watchdog({
  infraRecipients: ['244941713216'],
  supervisors: config.supervisors || [process.env.SUPERVISOR_NUMBERS || '244941713216'],
  sender,
  evolutionConfig,
  clientConfig: config,
  dependencies: {
    evolutionUrl: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instanceName: primaryInst,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY,
    redisClient: getRedis() || null,
    clientConfig: config,
  },
});
watchdog.start();

const { getIntentStats } = require('./engine/lib/intent-metrics');

app.get('/api/health/detailed', async (req, res) => {
  try {
    const evoInstance =
      config.evolutionInstance
      || process.env.EVOLUTION_INSTANCE
      || process.env.EVOLUTION_INSTANCE_NAME
      || 'default';
    const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const r = getRedis();
    let redisLabel = 'not_configured';
    if (r) {
      try {
        await r.ping();
        redisLabel = 'connected';
      } catch {
        redisLabel = 'error';
      }
    }
    const health = await getHealth({
      evolutionUrl: process.env.EVOLUTION_API_URL,
      apiKey: process.env.EVOLUTION_API_KEY,
      instanceName: evoInstance,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey,
      redisClient: r || null,
      clientConfig: config,
    });
    const evo = health.checks?.evolution?.status === 'ok'
      ? 'connected'
      : health.checks?.evolution?.status === 'not_configured'
        ? 'not_configured'
        : 'error';
    const sb = health.checks?.supabase?.status === 'ok'
      ? 'connected'
      : health.checks?.supabase?.status === 'not_configured'
        ? 'not_configured'
        : 'error';

    const payload = {
      status: health.status,
      uptime: health.uptime,
      redis: redisLabel,
      supabase: sb,
      sheets: fs.existsSync(credPath) ? 'configured' : 'not_configured',
      evolution: evo,
      lastMessage: watchdog.getLastMessageIso(),
      activeSessions: stateMachine.sessions.size,
      intentStats: getIntentStats(),
      timestamp: new Date().toISOString(),
    };
    const httpCode = health.status === 'unhealthy' ? 503 : 200;
    if (res.headersSent) return;
    res.status(httpCode).json(payload);
  } catch (e) {
    if (res.headersSent) return;
    res.status(500).json({ status: 'error', error: e.message });
  }
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

// ── Daily Intelligence Brief ──
if (process.env.DAILY_BRIEF_ENABLED === 'true') {
  const briefCron = require('./engine/intel/briefCron');
  briefCron.start();
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
  console.log(`📊 Daily Brief: ${process.env.DAILY_BRIEF_ENABLED === 'true' ? 'activado (07:00 Angola)' : 'desactivado'}`);
  console.log(`✅ Pronto!\n`);
});
// deploy-check Sun Mar 15 15:15:59 GMT 2026
// deploy-check Sun Mar 15 15:20:12 GMT 2026
