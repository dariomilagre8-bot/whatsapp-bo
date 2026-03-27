// engine/lib/messageLogger.js — Registo assíncrono de mensagens em pa_message_logs
// Usado pelo webhook handler para alimentar o Watchtower BI.
// Fire-and-forget: nunca bloqueia o handler nem propaga erros.
'use strict';

const { createLogger } = require('./logger');

/**
 * Loga uma mensagem IN ou OUT na tabela pa_message_logs (Supabase pa-engine).
 * @param {object} opts
 * @param {string} opts.clientSlug
 * @param {string} opts.remoteJid
 * @param {'in'|'out'} opts.direction
 * @param {string} [opts.messageText]
 * @param {string} [opts.intent]
 * @param {string} [opts.state]
 * @param {string} [opts.traceId]
 */
function logMessage({ clientSlug, remoteJid, direction, messageText, intent, state, traceId }) {
  const log = createLogger(traceId || null, clientSlug || null, 'message-logger');
  try {
    const sb = require('../../src/integrations/supabase').getClient();
    if (!sb) return;
    sb.from('pa_message_logs').insert({
      client_slug: clientSlug || 'unknown',
      remote_jid:  remoteJid  || '',
      direction,
      message_text: messageText ? String(messageText).substring(0, 500) : null,
      intent:       intent || null,
      state:        state  || null,
      trace_id:     traceId || null,
    }).then(() => {}).catch((err) => {
      log.warn('pa_message_logs insert falhou', { error: err.message });
    });
  } catch (err) {
    log.warn('messageLogger erro inesperado', { error: err.message });
  }
}

module.exports = { logMessage };
