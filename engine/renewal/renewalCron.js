// engine/renewal/renewalCron.js — Crons diários (pa_clients + Evolution)
// Activo só com RENEWAL_CRON_ENABLED=true. 09:00 Luanda: 3 dias + dia; 10:00: expirados.

'use strict';

const cron = require('node-cron');
const { getClientsForRenewal, getExpiredClients, markClientStatus } = require('./renewalCheck');
const { sendRenewalMessages } = require('./renewalSender');

let morningJob = null;
let expiredJob = null;

async function runMorningRenewals() {
  const d3 = await getClientsForRenewal(3);
  if (d3.length) await sendRenewalMessages(d3, 'AVISO_3_DIAS');
  const d0 = await getClientsForRenewal(0);
  if (d0.length) await sendRenewalMessages(d0, 'AVISO_DIA');
}

async function runExpiredBatch() {
  const clients = await getExpiredClients();
  if (!clients.length) return;
  const result = await sendRenewalMessages(clients, 'EXPIRADO');
  for (const phone of result.succeededPhones) {
    try {
      await markClientStatus(phone, 'expired');
    } catch (err) {
      console.error(`[RENEWAL-CRON] markClientStatus falhou ${phone}:`, err.message);
    }
  }
}

function start() {
  if (morningJob || expiredJob) return;
  morningJob = cron.schedule(
    '0 9 * * *',
    () => runMorningRenewals().catch((e) => console.error('[RENEWAL-CRON] manhã:', e.message)),
    { timezone: 'Africa/Luanda' }
  );
  expiredJob = cron.schedule(
    '0 10 * * *',
    () => runExpiredBatch().catch((e) => console.error('[RENEWAL-CRON] expirados:', e.message)),
    { timezone: 'Africa/Luanda' }
  );
  console.log('[RENEWAL-CRON] Registado: 09:00 AVISO_3_DIAS+AVISO_DIA; 10:00 EXPIRADO (Africa/Luanda)');
}

function stop() {
  if (morningJob) morningJob.stop();
  if (expiredJob) expiredJob.stop();
  morningJob = null;
  expiredJob = null;
}

module.exports = { start, stop, runMorningRenewals, runExpiredBatch };
