// engine/alerts/notifyDon.js — Alerta WhatsApp para supervisor (Don) quando job falha 3x
// Config: ALERT_PHONE (default 244941713216), ALERT_INSTANCE_NAME, EVOLUTION_API_URL, EVOLUTION_API_KEY

'use strict';

const { createLogger } = require('../lib/logger');

const logger = createLogger(null, 'engine', 'notify-don');

const DEFAULT_ALERT_PHONE = '244941713216';

/**
 * Envia alerta WhatsApp ao supervisor (Don) via Evolution API.
 * @param {string} clientSlug - Slug do cliente onde ocorreu a falha
 * @param {string} errorMessage - Mensagem de erro resumida
 * @returns {Promise<boolean>} true se enviado com sucesso
 */
async function notifyDon(clientSlug, errorMessage) {
  const alertPhone = process.env.ALERT_PHONE || DEFAULT_ALERT_PHONE;
  const instanceName = process.env.ALERT_INSTANCE_NAME;
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!instanceName || !apiUrl || !apiKey) {
    logger.warn('notifyDon: variáveis de ambiente em falta (ALERT_INSTANCE_NAME / EVOLUTION_API_URL / EVOLUTION_API_KEY)');
    return false;
  }

  const safeError = String(errorMessage || 'erro desconhecido').slice(0, 300);
  const message = `[PA ALERTA] Bot ${clientSlug} - Mensagem falhou 3x: ${safeError}`;
  const jid = alertPhone.includes('@') ? alertPhone : `${alertPhone}@s.whatsapp.net`;

  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({ number: jid, text: message }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('notifyDon: Evolution API falhou', { status: res.status, body: body.slice(0, 200) });
      return false;
    }

    logger.info('notifyDon: alerta enviado com sucesso', { alertPhone, clientSlug });
    return true;
  } catch (err) {
    logger.error('notifyDon: erro de rede', { error: err.message });
    return false;
  }
}

/**
 * Gera a mensagem de alerta sem enviar (útil para testes).
 * @param {string} clientSlug
 * @param {string} errorMessage
 * @returns {string}
 */
function buildAlertMessage(clientSlug, errorMessage) {
  const safeError = String(errorMessage || 'erro desconhecido').slice(0, 300);
  return `[PA ALERTA] Bot ${clientSlug} - Mensagem falhou 3x: ${safeError}`;
}

module.exports = { notifyDon, buildAlertMessage };
