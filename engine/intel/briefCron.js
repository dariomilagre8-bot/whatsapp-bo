// engine/intel/briefCron.js — Cron diário 07:00 Angola (UTC+1 → '0 6 * * *' UTC)
// Activo apenas quando DAILY_BRIEF_ENABLED=true no .env

'use strict';

const cron = require('node-cron');

let job = null;

function start() {
  if (job) return;

  // '0 6 * * *' UTC = 07:00 em Africa/Luanda (UTC+1)
  job = cron.schedule('0 6 * * *', async () => {
    const ts = new Date().toISOString();
    try {
      const { generateBrief } = require('./dailyBrief');
      const { sendBrief }     = require('./sendBrief');

      const text = await generateBrief();
      await sendBrief(text);
      console.log(`[BRIEF] Sent at ${ts}`);
    } catch (err) {
      console.error(`[BRIEF] Erro ao gerar/enviar brief (${ts}):`, err.message);
    }
  }, { timezone: 'UTC' });

  console.log('[BRIEF] Daily Brief cron registado (07:00 Angola / 06:00 UTC)');
}

function stop() {
  if (job) { job.stop(); job = null; }
}

module.exports = { start, stop };
