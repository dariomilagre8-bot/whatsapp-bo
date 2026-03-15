// engine/lib/cron-manager.js — Agendamento genérico por client (renewalCron, etc.)

const cron = require('node-cron');
const { createLogger } = require('./logger');

const jobs = [];

/**
 * Regista um cron por cliente (ex: renewalCron).
 * @param {string} clientSlug
 * @param {string} cronExpr - Ex: '0 9 28 * *'
 * @param {Function} fn - async () => {}
 */
function register(clientSlug, cronExpr, fn) {
  if (!cronExpr || !cron.validate(cronExpr)) {
    createLogger(null, clientSlug, 'cron').warn('cron-manager: expressão inválida', { cronExpr });
    return;
  }
  const job = cron.schedule(cronExpr, async () => {
    const traceId = require('crypto').randomUUID();
    const log = createLogger(traceId, clientSlug, 'cron');
    log.info('cron disparado', { schedule: cronExpr });
    try {
      await fn();
    } catch (err) {
      log.error('cron error', { error: err.message });
    }
  }, { timezone: 'Africa/Luanda' });
  jobs.push({ clientSlug, cronExpr, job });
}

function stopAll() {
  for (const { job } of jobs) {
    job.stop();
  }
  jobs.length = 0;
}

module.exports = { register, stopAll };
