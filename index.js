require('dotenv').config();
const branding = require('./branding');
const express = require('express');
const cors = require('cors');
const config = require('./src/config');
const { port, MAIN_BOSS } = config;
const { fetchAllRows, markProfileAvailable, isIndisponivel } = require('./googleSheets');
const estados = require('./src/utils/estados');
const { loadSessionsOnStartup } = estados;
const { sendWhatsAppMessage } = require('./src/whatsapp');
const notif = require('./src/utils/notificacoes');
const { initExpiracaoScheduler } = require('./src/handlers/expiracoes');
const qrRouter = require('./src/routes/qr');
const chatRouter = require('./src/routes/chat');
const checkoutRouter = require('./src/routes/checkout');
const publicRouter = require('./src/routes/public');
const adminRouter = require('./src/routes/admin');
const { handleWebhook } = require('./src/routes/webhook');

const { clientStates, pendingVerifications, cleanupSession } = estados;
estados.startFlushInterval();
notif.init({ sendWhatsAppMessage, MAIN_BOSS, cleanupSession, clientStates, pendingVerifications });
notif.startSweeps();

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-secret'],
}));

app.use('/', qrRouter);
app.use('/api', chatRouter);
app.use('/api', checkoutRouter);
app.use('/api', publicRouter);
app.get('/api/branding', (req, res) => res.json(branding));
app.get('/api/version', (req, res) => res.json({ v: '20260225-refactor-fase2', started: new Date().toISOString() }));
app.use('/api/admin', adminRouter);
app.post('/', handleWebhook);

initExpiracaoScheduler({
  sendWhatsAppMessage,
  MAIN_BOSS,
  branding,
  fetchAllRows,
  markProfileAvailable,
  isIndisponivel,
});

console.log('📱 Telefones Reais:', config.REAL_PHONES);
console.log('🖥️ Todos os IDs aceites:', config.ALL_SUPERVISORS);
console.log('👑 Chefe Principal:', config.MAIN_BOSS);

loadSessionsOnStartup().then(() => {
  app.listen(port, '0.0.0.0', () => console.log(`Bot v17.0 (${branding.nome}) rodando na porta ${port}`));
});
