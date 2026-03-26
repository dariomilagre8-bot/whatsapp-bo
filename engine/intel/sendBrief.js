// engine/intel/sendBrief.js — Envia Daily Brief via Evolution API (sem circuit-breaker)
// Endpoint interno: http://jules_whatssiru:80/message/sendText/{instanceName}

'use strict';

const { getInfraAlertRecipientsFromEnv } = require('../lib/infraRecipients');
const RETRY_DELAY_MS  = 30_000;

function resolveInstance() {
  return (
    process.env.BRIEF_INSTANCE_NAME
    || process.env.EVOLUTION_INSTANCE
    || process.env.EVOLUTION_INSTANCE_NAME
    || ''
  );
}

function buildUrl(instance) {
  const base = (process.env.EVOLUTION_API_URL || 'http://jules_whatssiru:80')
    .replace(/\/$/, '');
  return `${base}/message/sendText/${encodeURIComponent(instance)}`;
}

function toJid(phone) {
  const p = String(phone || '').trim();
  if (p.includes('@')) return p;
  return `${p.replace(/\D/g, '')}@s.whatsapp.net`;
}

async function postToEvolution(briefText, instance, recipientJid) {
  const url = buildUrl(instance);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.EVOLUTION_API_KEY || '',
    },
    body: JSON.stringify({
      number: recipientJid,
      text: briefText,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.substring(0, 120)}`);
  }
  return true;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Envia o brief para Don. Retry único após RETRY_DELAY_MS se falhar.
 * @param {string} briefText
 * @returns {Promise<boolean>} true se enviou com sucesso
 */
async function sendBrief(briefText) {
  const instance = resolveInstance();
  const recipients = getInfraAlertRecipientsFromEnv().map(toJid);

  if (!instance) {
    console.error('[BRIEF] BRIEF_INSTANCE_NAME / EVOLUTION_INSTANCE não definido — envio cancelado');
    return false;
  }

  try {
    for (const jid of recipients) await postToEvolution(briefText, instance, jid);
    console.log(`[BRIEF] Enviado → ${recipients.join(', ')} (${instance})`);
    return true;
  } catch (err) {
    console.warn(`[BRIEF] Falha (1ª tentativa): ${err.message} — retry em ${RETRY_DELAY_MS / 1000}s`);
  }

  await sleep(RETRY_DELAY_MS);

  try {
    for (const jid of recipients) await postToEvolution(briefText, instance, jid);
    console.log(`[BRIEF] Enviado (retry) → ${recipients.join(', ')}`);
    return true;
  } catch (err) {
    console.error(`[BRIEF] Falha definitiva: ${err.message}`);
    return false;
  }
}

module.exports = { sendBrief, buildUrl, resolveInstance };
