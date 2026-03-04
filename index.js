// index.js
require('dotenv').config();

const express = require('express');
const config = require('./config/streamzone');
const StateMachine = require('./src/engine/state-machine');
const { createWebhookHandler } = require('./src/routes/webhook');
const llm = require('./src/engine/llm');
const googleSheets = require('./src/integrations/google-sheets');
const supabaseIntegration = require('./src/integrations/supabase');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ── Init serviços ──
const credPath = path.join(__dirname, 'credentials.json');
if (fs.existsSync(credPath)) {
  googleSheets.init(credPath, process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEET_ID || '18YCr1aIFpUNnj4NOOFItP3umnSJGsl2oPmGihIxOa0s');
  console.log('✅ Google Sheets inicializado');
}

supabaseIntegration.init(process.env.SUPABASE_URL, process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY);
console.log('✅ Supabase inicializado');

llm.init(process.env.GEMINI_API_KEY);
console.log('✅ Gemini inicializado');

// ── State Machine ──
const stateMachine = new StateMachine(config);

// Limpeza de sessões expiradas a cada hora
setInterval(() => stateMachine.cleanup(), 60 * 60 * 1000);

// ── Stock function (cached 60s) ──
let stockCache = {};
let stockCacheTime = 0;
const STOCK_CACHE_TTL = 60 * 1000; // 60 segundos

async function getStock() {
  const now = Date.now();
  if (now - stockCacheTime < STOCK_CACHE_TTL) return stockCache;
  try {
    stockCache = await googleSheets.getStock(config.stock);
    stockCacheTime = now;
  } catch (err) {
    console.error('[STOCK] Cache refresh failed:', err.message);
  }
  return stockCache;
}

// ── System prompt ──
const systemPrompt = fs.readFileSync(path.join(__dirname, 'prompts/streamzone.txt'), 'utf-8');

// ── Evolution API config ──
const evolutionConfig = {
  apiUrl: process.env.EVOLUTION_API_URL,
  apiKey: process.env.EVOLUTION_API_KEY,
  instance: process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'Zara-Teste',
};

// ── Routes ──
const webhookHandler = createWebhookHandler(config, stateMachine, getStock, evolutionConfig, systemPrompt);
app.post('/webhook', webhookHandler);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    engine: 'Palanca Bot Engine v1.0',
    bot: config.identity.botName,
    business: config.identity.businessName,
    sessions: stateMachine.sessions.size,
    uptime: process.uptime(),
  });
});

// ── Start ──
const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`\n🚀 Palanca Bot Engine v1.0`);
  console.log(`🤖 Bot: ${config.identity.botName} (${config.identity.businessName})`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`👑 Supervisores: ${process.env.SUPERVISOR_NUMBERS}`);
  console.log(`✅ Pronto!\n`);
});
