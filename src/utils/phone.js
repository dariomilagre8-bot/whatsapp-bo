// src/utils/phone.js — Extração e normalização de telefone (JID Evolution / WhatsApp)
// BUG-072: 09XXXXXXXX → Angola; 08… e outros LIDs não assumem 244.

const ANGOLAN_PHONE_LENGTH = 12; // 244 + 9 dígitos
const ANGOLAN_PREFIX = '244';
const PORTUGUESE_PREFIX = '351';
const PORTUGUESE_PHONE_LENGTH = 12; // 351 + 9 dígitos
const GAMBIA_PREFIX = '220';
const GAMBIA_PHONE_LENGTH = 10; // 220 + 7 dígitos

/**
 * Normaliza número para formato internacional (dígitos apenas).
 * LID tipo 0808441748 não é assumido como Angola (só 09… nacional).
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function normalizePhone(raw) {
  if (raw == null || raw === '') return null;
  let num = String(raw).replace(/\D/g, '');
  if (!num) return null;

  if (num.startsWith('244') && num.length === 12) return num;
  if (num.startsWith('351') && num.length === 12) return num;
  if (num.startsWith('220') && num.length === GAMBIA_PHONE_LENGTH) return num;

  if (num.length === 9 && num.startsWith('9')) return ANGOLAN_PREFIX + num;

  if (num.length === 10 && num.startsWith('09')) return ANGOLAN_PREFIX + num.slice(1);

  return num;
}

/**
 * Extrai e normaliza o número a partir de um JID ou string.
 *
 * @param {string} jid
 * @returns {string} número limpo ou string vazia se inválido
 */
function extractPhoneNumber(jid) {
  if (jid == null || typeof jid !== 'string') return '';
  const raw = String(jid).trim();
  if (!raw) return '';

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length > 15) {
    console.warn(`[PHONE] JID com mais de 15 dígitos (possível encoding): "${jid}" → extraído "${digits}"`);
  }

  if (digits.length === ANGOLAN_PHONE_LENGTH && digits.startsWith(ANGOLAN_PREFIX)) {
    return digits;
  }

  if (digits.length === PORTUGUESE_PHONE_LENGTH && digits.startsWith(PORTUGUESE_PREFIX)) {
    return digits;
  }

  if (digits.length === GAMBIA_PHONE_LENGTH && digits.startsWith(GAMBIA_PREFIX)) {
    return digits;
  }

  const match244 = digits.match(/244\d{9}/);
  if (match244) {
    return match244[0];
  }

  if (digits.length === 9 && digits.startsWith('9')) {
    return ANGOLAN_PREFIX + digits;
  }

  // Nacional AO com 0: só 09XXXXXXXX → 244 + 9 dígitos (evita tratar LID 08… como Angola)
  if (digits.length === 10 && digits.startsWith('09')) {
    return ANGOLAN_PREFIX + digits.slice(1);
  }

  if (digits.length > ANGOLAN_PHONE_LENGTH) {
    const last12 = digits.slice(-12);
    if (last12.startsWith(ANGOLAN_PREFIX) && /^244\d{9}$/.test(last12)) {
      console.warn(`[PHONE] Número longo corrigido: "${digits}" → "${last12}"`);
      return last12;
    }
  }

  const n = normalizePhone(digits);
  if (!n) return '';
  if (n.length < 9) return '';
  return n;
}

module.exports = { extractPhoneNumber, normalizePhone };
