// engine/lib/sender.js — Envio de mensagens via Evolution API

const { CircuitBreaker } = require('./circuit-breaker');

const evolutionBreaker = new CircuitBreaker('evolution', { maxFailures: 3, resetTimeout: 60000 });

/**
 * Instância Evolution a usar: config do cliente (multi-tenant), depois evolutionConfig.instance, depois .env.
 * @param {{ instance?: string } | null | undefined} evolutionConfig
 * @param {{ evolutionInstance?: string } | null | undefined} clientConfig
 * @returns {string}
 */
function resolveEvolutionInstance(evolutionConfig, clientConfig) {
  if (clientConfig && clientConfig.evolutionInstance) {
    return String(clientConfig.evolutionInstance);
  }
  if (evolutionConfig && evolutionConfig.instance) {
    return String(evolutionConfig.instance);
  }
  return (
    process.env.EVOLUTION_INSTANCE
    || process.env.EVOLUTION_INSTANCE_NAME
    || ''
  );
}

/**
 * @param {string} phone
 * @param {string} text
 * @param {{ apiUrl?: string, apiKey?: string, instance?: string }} evolutionConfig
 * @param {{ evolutionInstance?: string } | null | undefined} [clientConfig] — multi-tenant: prioridade sobre instance em evolutionConfig
 */
async function sendText(phone, text, evolutionConfig, clientConfig = null) {
  const apiUrl = evolutionConfig?.apiUrl || process.env.EVOLUTION_API_URL;
  const apiKey = evolutionConfig?.apiKey || process.env.EVOLUTION_API_KEY;
  const instance = resolveEvolutionInstance(evolutionConfig, clientConfig);

  if (!apiUrl || !apiKey || !instance) {
    console.error('[SEND] SKIP: falta apiUrl, apiKey ou instance (config cliente / evolutionConfig / .env)');
    return false;
  }

  if (!evolutionBreaker.canExecute()) {
    console.warn('[SEND] Circuit breaker Evolution ABERTO — envio ignorado');
    return false;
  }

  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: jid,
        text: text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[SEND] FAIL to ${phone}: ${res.status} ${err}`);
      evolutionBreaker.recordFailure();
      return false;
    }

    evolutionBreaker.recordSuccess();
    console.log(`[SEND] OK → ${phone} (${text.substring(0, 60)}...)`);
    return true;
  } catch (err) {
    console.error(`[SEND] ERROR to ${phone}:`, err.message);
    evolutionBreaker.recordFailure();
    return false;
  }
}

module.exports = { sendText, resolveEvolutionInstance, evolutionBreaker };
