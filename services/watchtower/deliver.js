// services/watchtower/deliver.js — Formata e envia resumo semanal via Evolution API
'use strict';

const { createLogger } = require('../../engine/lib/logger');

// Mapeamento slug → nome do bot e número de destino
const BOT_NAMES = {
  streamzone: 'Zara (StreamZone)',
  luna:       'Luna (PA Comercial)',
  demo:       'Bia (Demo Moda)',
};

/**
 * Obtém destinatário por slug: WATCHTOWER_NOTIFY_<SLUG> → WATCHTOWER_NOTIFY_PHONES → BOSS_NUMBER/ALERT_PHONE.
 */
function getRecipient(clientSlug) {
  const envKey = `WATCHTOWER_NOTIFY_${clientSlug.toUpperCase()}`;
  return (
    process.env[envKey]
    || process.env.WATCHTOWER_NOTIFY_PHONES
    || process.env.BOSS_NUMBER
    || process.env.ALERT_PHONE
    || '244941713216'
  );
}

/**
 * Formata mensagem WhatsApp legível para o resumo diário/semanal.
 */
function formatSummary(summary) {
  const { client_slug, date, messages_total, messages_from_clients,
          sales_completed, sales_abandoned, top_products,
          sentiment_positive, sentiment_negative } = summary;

  const botName = BOT_NAMES[client_slug] || client_slug;
  const topStr  = (top_products || []).slice(0, 3)
    .map(p => `${p.product} (${p.count}x)`)
    .join(', ') || '—';

  return (
    `📊 *Resumo ${date} — ${botName}*\n` +
    `📨 Mensagens: ${messages_total} (${messages_from_clients} de clientes)\n` +
    `💰 Vendas: ${sales_completed} concluídas, ${sales_abandoned} abandonadas\n` +
    `🏆 Top: ${topStr}\n` +
    `😊 Sentimento: +${sentiment_positive || 0} / -${sentiment_negative || 0}`
  );
}

/**
 * Envia resumo via Evolution API.
 * @param {string} clientSlug
 * @param {object} summary - resultado de analyze()
 */
async function deliver(clientSlug, summary) {
  const traceId = require('crypto').randomUUID();
  const log = createLogger(traceId, clientSlug, 'watchtower-deliver');

  const apiUrl  = process.env.EVOLUTION_API_URL;
  const apiKey  = process.env.EVOLUTION_API_KEY;
  const instance = process.env.WATCHTOWER_INSTANCE_NAME
    || process.env.BRIEF_INSTANCE_NAME
    || process.env.ALERT_INSTANCE_NAME
    || process.env.EVOLUTION_INSTANCE
    || process.env.EVOLUTION_INSTANCE_NAME;

  if (!apiUrl || !apiKey || !instance) {
    log.warn('deliver: Evolution não configurado', { apiUrl: !!apiUrl, apiKey: !!apiKey, instance });
    return { sent: false, reason: 'evolution_not_configured' };
  }

  const recipient = getRecipient(clientSlug);
  const text      = formatSummary(summary);
  const jid       = recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`;

  log.info('deliver: enviar resumo', { recipient, instance });

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: jid, text }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      log.warn('deliver: Evolution recusou', { status: res.status, body: errBody.substring(0, 200) });
      return { sent: false, reason: `evolution_${res.status}` };
    }

    log.info('deliver: resumo enviado', { recipient });
    return { sent: true, recipient };
  } catch (err) {
    log.error('deliver: erro inesperado', { error: err.message });
    return { sent: false, reason: err.message };
  }
}

module.exports = { deliver, formatSummary, getRecipient };
