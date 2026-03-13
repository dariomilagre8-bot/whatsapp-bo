// src/utils/phone.js — Extração e validação de número de telefone a partir de JID (Evolution API, WhatsApp)

const ANGOLAN_PHONE_LENGTH = 12; // 244 + 9 dígitos
const ANGOLAN_PREFIX = '244';

/**
 * Extrai e normaliza o número de telefone a partir de um JID ou string.
 * Remove TUDO o que não for dígito (@c.us, @s.whatsapp.net, etc.).
 * Resultado final: 12 dígitos começando por 244 (ex: 244946014060).
 * Se vier apenas 9 dígitos a começar por 9, injeta o prefixo 244.
 * @param {string} jid - remoteJid ou sender (ex: "244946014060@s.whatsapp.net", "946014060@c.us")
 * @returns {string} - Número limpo 12 dígitos 244XXXXXXXXX ou string vazia
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

  const match244 = digits.match(/244\d{9}/);
  if (match244) {
    return match244[0];
  }

  if (digits.length === 9 && digits.startsWith('9')) {
    return ANGOLAN_PREFIX + digits;
  }

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
