// engine/lib/infraRecipients.js — Destinatários de alertas técnicos (watchdog, não escalação de cliente)
'use strict';

const DEFAULT_BOSS = '244941713216';

/**
 * Filtra tokens que parecem MSISDN (9–12 dígitos). Rejeita LIDs longos (ex.: 15 dígitos)
 * frequentemente colados por engano em BOSS_NUMBER junto ao número real.
 */
function isLikelyRealMsisdn(digits) {
  return Boolean(digits && digits.length >= 9 && digits.length <= 12);
}

/**
 * Lista para `[PA INFO]` / `[PA ALERTA]` do watchdog: `BOSS_NUMBER` (CSV) → fallback `ALERT_PHONE` → Don.
 */
function getInfraAlertRecipientsFromEnv() {
  const raw = process.env.BOSS_NUMBER || process.env.ALERT_PHONE || DEFAULT_BOSS;
  const list = String(raw)
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(isLikelyRealMsisdn);
  const uniq = [...new Set(list)];
  return uniq.length ? uniq : [DEFAULT_BOSS];
}

module.exports = {
  getInfraAlertRecipientsFromEnv,
  DEFAULT_BOSS,
  isLikelyRealMsisdn,
};
