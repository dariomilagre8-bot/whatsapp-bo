// src/utils/phone.js — Extração e validação de número de telefone a partir de JID (Evolution API, WhatsApp)

const ANGOLAN_PHONE_LENGTH = 12; // 244 + 9 dígitos
const ANGOLAN_PREFIX = '244';
const PORTUGUESE_PREFIX = '351';
const PORTUGUESE_PHONE_LENGTH = 12; // 351 + 9 dígitos

/**
 * Extrai e normaliza o número de telefone a partir de um JID ou string.
 * Remove TUDO o que não for dígito (@c.us, @s.whatsapp.net, etc.).
 * Suporta Angola (244), Portugal (351) e LIDs sem prefixo.
 *
 * Casos tratados (BUG-072):
 * - "244XXXXXXXXX" (12 díg) → devolve como está (Angola com prefixo)
 * - "351XXXXXXXXX" (12 díg) → devolve como está (Portugal com prefixo)
 * - "9XXXXXXXX" (9 díg, começa 9) → "244" + 9 dígitos (Angola s/ prefixo)
 * - "0XXXXXXXXX" (10 díg, começa 0) → "244" + últimos 9 dígitos (LID angolano)
 * - Números longos com 244 embutido → extrai a sequência correcta
 *
 * @param {string} jid - remoteJid ou sender (ex: "244946014060@s.whatsapp.net", "946014060@c.us")
 * @returns {string} - Número limpo (12 dígitos) ou string vazia se inválido
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

  // Angola normalizado: 244 + 9 dígitos = 12 dígitos
  if (digits.length === ANGOLAN_PHONE_LENGTH && digits.startsWith(ANGOLAN_PREFIX)) {
    return digits;
  }

  // Portugal normalizado: 351 + 9 dígitos = 12 dígitos
  if (digits.length === PORTUGUESE_PHONE_LENGTH && digits.startsWith(PORTUGUESE_PREFIX)) {
    return digits;
  }

  // Extrair 244XXXXXXXXX de dentro de uma string mais longa
  const match244 = digits.match(/244\d{9}/);
  if (match244) {
    return match244[0];
  }

  // Angola sem prefixo: 9 dígitos a começar por 9
  if (digits.length === 9 && digits.startsWith('9')) {
    return ANGOLAN_PREFIX + digits;
  }

  // LID angolano: 10 dígitos a começar por 0 (ex: 0808441748 → 244808441748)
  if (digits.length === 10 && digits.startsWith('0')) {
    return ANGOLAN_PREFIX + digits.slice(1);
  }

  // Números longos: tentar extrair os últimos 12 com prefixo 244
  if (digits.length > ANGOLAN_PHONE_LENGTH) {
    const last12 = digits.slice(-12);
    if (last12.startsWith(ANGOLAN_PREFIX) && /^244\d{9}$/.test(last12)) {
      console.warn(`[PHONE] Número longo corrigido: "${digits}" → "${last12}"`);
      return last12;
    }
  }

  return '';
}

module.exports = { extractPhoneNumber };
