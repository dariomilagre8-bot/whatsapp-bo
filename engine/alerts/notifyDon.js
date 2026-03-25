// engine/alerts/notifyDon.js — Alerta supervisor (Don) + resumo renovação multi-destino
// Config: ALERT_PHONE, RENEWAL_NOTIFY_PHONES, ALERT_INSTANCE_NAME, EVOLUTION_API_URL, EVOLUTION_API_KEY

'use strict';

const { createLogger } = require('../lib/logger');

const logger = createLogger(null, 'engine', 'notify-don');

const DEFAULT_ALERT_PHONE = '244941713216';
const RENEWAL_NOTIFY_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Lista de números para o resumo [PA RENOVAÇÃO] após cada batch. Fallback: ALERT_PHONE. */
function getRenewalNotifyPhoneList() {
  const raw = process.env.RENEWAL_NOTIFY_PHONES;
  if (raw !== undefined && raw !== null) {
    const list = String(raw)
      .split(',')
      .map((s) => s.replace(/\D/g, ''))
      .filter(Boolean);
    if (list.length > 0) return list;
  }
  return [process.env.ALERT_PHONE || DEFAULT_ALERT_PHONE];
}

async function sendEvolutionTextToNumber(rawPhone, messageText) {
  const instanceName = process.env.ALERT_INSTANCE_NAME;
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!instanceName || !apiUrl || !apiKey) {
    logger.warn('notifyDon: variáveis em falta (ALERT_INSTANCE_NAME / EVOLUTION_API_URL / EVOLUTION_API_KEY)');
    return false;
  }

  const digits = String(rawPhone || '').replace(/\D/g, '');
  const jid = String(rawPhone || '').includes('@') ? rawPhone : `${digits}@s.whatsapp.net`;

  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({ number: jid, text: messageText }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('notifyDon: Evolution API falhou', { status: res.status, body: body.slice(0, 200) });
      return false;
    }

    logger.info('notifyDon: mensagem enviada ao supervisor', { alertPhone: digits });
    return true;
  } catch (err) {
    logger.error('notifyDon: erro de rede', { error: err.message });
    return false;
  }
}

async function sendEvolutionTextToSupervisor(messageText) {
  const alertPhone = process.env.ALERT_PHONE || DEFAULT_ALERT_PHONE;
  return sendEvolutionTextToNumber(alertPhone, messageText);
}

async function notifyDon(clientSlug, errorMessage) {
  const safeError = String(errorMessage || 'erro desconhecido').slice(0, 300);
  const message = `[PA ALERTA] Bot ${clientSlug} - Mensagem falhou 3x: ${safeError}`;
  const ok = await sendEvolutionTextToSupervisor(message);
  if (ok) logger.info('notifyDon: alerta enviado com sucesso', { clientSlug });
  return ok;
}

function buildAlertMessage(clientSlug, errorMessage) {
  const safeError = String(errorMessage || 'erro desconhecido').slice(0, 300);
  return `[PA ALERTA] Bot ${clientSlug} - Mensagem falhou 3x: ${safeError}`;
}

function buildRenewalSummaryMessage({ templateKey, sent, failed, failedNames }) {
  let msg = `[PA RENOVAÇÃO] Enviados ${sent} avisos (${templateKey}). Falhas: ${failed}.`;
  if (failed > 0 && failedNames && failedNames.length) {
    msg += ` Falharam: ${failedNames.join(', ')}.`;
  }
  return msg;
}

async function notifyDonRenewalSummary(opts) {
  const msg = buildRenewalSummaryMessage(opts);
  const phones = getRenewalNotifyPhoneList();
  let allOk = true;
  for (let i = 0; i < phones.length; i++) {
    if (i > 0) await sleep(RENEWAL_NOTIFY_DELAY_MS);
    const ok = await sendEvolutionTextToNumber(phones[i], msg);
    if (!ok) allOk = false;
  }
  return allOk;
}

module.exports = {
  notifyDon,
  buildAlertMessage,
  buildRenewalSummaryMessage,
  notifyDonRenewalSummary,
  sendEvolutionTextToSupervisor,
  getRenewalNotifyPhoneList,
};
