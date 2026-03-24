// engine/health/readyCheck.js — Endpoint GET /ready: Redis + Supabase + Queue worker
// Retorna { status: 'ok'|'degraded', redis, supabase, queue }

'use strict';

const { createLogger } = require('../lib/logger');

const logger = createLogger(null, 'engine', 'ready-check');

/** Testa conectividade Redis via PING. Abre/fecha conexão dedicada para não interferir com o pool. */
async function checkRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return false;
  let client = null;
  try {
    const Redis = require('ioredis');
    client = new Redis(url, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 });
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (err) {
    logger.warn('readyCheck: Redis PING falhou', { error: err.message });
    return false;
  } finally {
    if (client) client.quit().catch(() => {});
  }
}

/** Consulta Supabase: SELECT 1 FROM pa_daily_insights LIMIT 1 via REST. */
async function checkSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/pa_daily_insights?select=1&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    // 200 = ok; 406 = schema correcto mas tabela sem dados (também ok)
    return res.ok || res.status === 406;
  } catch (err) {
    logger.warn('readyCheck: Supabase falhou', { error: err.message });
    return false;
  }
}

/**
 * Verifica se o worker BullMQ está activo.
 * @param {Function} [getWorkerFn] - Função que devolve o worker (ex: messageQueue.getWorker)
 */
function checkQueue(getWorkerFn) {
  try {
    if (typeof getWorkerFn !== 'function') return false;
    const worker = getWorkerFn();
    return worker != null && !worker.closing;
  } catch {
    return false;
  }
}

/**
 * Agrega os três checks e devolve status consolidado.
 * @param {Function} [getWorkerFn] - Injectado para permitir mock em testes
 * @returns {Promise<{ status: 'ok'|'degraded', redis: boolean, supabase: boolean, queue: boolean }>}
 */
async function getReadyStatus(getWorkerFn) {
  const [redisResult, supabaseResult] = await Promise.allSettled([
    checkRedis(),
    checkSupabase(),
  ]);

  const redis = redisResult.status === 'fulfilled' && redisResult.value === true;
  const supabase = supabaseResult.status === 'fulfilled' && supabaseResult.value === true;
  const queue = checkQueue(getWorkerFn);

  const status = redis && supabase && queue ? 'ok' : 'degraded';

  logger.info('readyCheck', { status, redis, supabase, queue });

  return { status, redis, supabase, queue };
}

module.exports = { getReadyStatus, checkRedis, checkSupabase, checkQueue };
