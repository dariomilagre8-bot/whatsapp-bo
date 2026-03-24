// engine/renewal/renewalSender.js — Envio Evolution + resumo ao Don

'use strict';

const { renderRenewalMessage } = require('./renewalMessages');
const { notifyDonRenewalSummary } = require('../alerts/notifyDon');

const DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toJid(phone) {
  const p = String(phone || '').trim();
  if (p.includes('@')) return p;
  return `${p.replace(/\D/g, '')}@s.whatsapp.net`;
}

async function postEvolutionText(number, text) {
  const apiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.RENEWAL_INSTANCE_NAME;
  if (!apiUrl || !apiKey || !instanceName) {
    throw new Error('EVOLUTION_API_URL / EVOLUTION_API_KEY / RENEWAL_INSTANCE_NAME em falta');
  }
  const url = `${apiUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number, text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
  return true;
}

/**
 * @param {object[]} clients
 * @param {'AVISO_3_DIAS'|'AVISO_DIA'|'EXPIRADO'} templateKey
 * @param {{ dryRun?: boolean, notifyDon?: boolean }} [opts]
 */
async function sendRenewalMessages(clients, templateKey, opts = {}) {
  const dryRun = opts.dryRun === true;
  const notifyDon = opts.notifyDon !== false && !dryRun;
  const delayMs = opts.delayMs != null ? opts.delayMs : DELAY_MS;
  const list = Array.isArray(clients) ? clients : [];
  const errors = [];
  const succeededPhones = [];
  let sent = 0;
  let failed = 0;
  let first = true;

  for (const client of list) {
    if (!first) await sleep(delayMs);
    first = false;
    const messageText = renderRenewalMessage(templateKey, client);
    const phone = client.phone;
    const name = client.name || phone;
    if (dryRun) {
      console.log(`[RENEWAL] [dry-run] ${templateKey} → ${name} (${phone})`);
      sent++;
      succeededPhones.push(String(phone).replace(/\D/g, ''));
      continue;
    }
    try {
      await postEvolutionText(toJid(phone), messageText);
      sent++;
      succeededPhones.push(String(phone).replace(/\D/g, ''));
      console.log(`[RENEWAL] Enviado ${templateKey} para ${name} (${phone})`);
    } catch (err) {
      failed++;
      errors.push({ phone, name, error: err.message });
      console.error(`[RENEWAL] Falha ${templateKey} para ${name} (${phone}):`, err.message);
    }
  }

  if (notifyDon && list.length > 0) {
    const failedNames = errors.map((e) => e.name || e.phone);
    await notifyDonRenewalSummary({ templateKey, sent, failed, failedNames });
  }

  return { sent, failed, errors, succeededPhones };
}

module.exports = { sendRenewalMessages, postEvolutionText, DELAY_MS };
