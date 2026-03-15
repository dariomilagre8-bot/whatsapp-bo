// engine/middleware/webhook-router.js — POST /webhook → 200 imediato, routing por instanceName, dedup, trace_id

const { isDuplicate } = require('../lib/dedup');
const logger = require('../lib/logger');

/**
 * Cria o middleware do webhook: responde 200 em <50ms, depois processa em background.
 * @param {Object} registry - Mapa instanceName -> { config, handler }
 * @param {Object} [redis] - Cliente Redis opcional (dedup)
 */
function createWebhookRouter(registry, redis = null) {
  return async function webhookRouter(req, res) {
    res.status(200).json({ ok: true });

    const body = req && req.body;
    const data = body && body.data;
    if (!data || !data.key) return;

    const instanceName = body?.instance || body?.instanceName || body?.provider?.instance
      || body?.data?.provider?.instance || process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '';

    const entry = registry[instanceName];
    if (!entry) {
      logger.warn('webhook: instance não encontrada', { instanceName });
      return;
    }

    const { config, handler } = entry;
    const clientSlug = config.slug || instanceName;
    const messageId = data.key?.id || data.key?.remoteJid + '-' + Date.now();
    const duplicate = await isDuplicate(redis, messageId, clientSlug);
    if (duplicate) return;

    const traceId = require('crypto').randomUUID();
    req.traceId = traceId;
    req.clientSlug = clientSlug;
    req.clientConfig = config;

    try {
      await handler(req, res);
    } catch (err) {
      logger.error('webhook handler error', { traceId, clientSlug, error: err.message });
    }
  };
}

module.exports = { createWebhookRouter };
