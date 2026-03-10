// src/utils/phone.js — Extração e validação de número de telefone a partir de JID (Evolution API, WhatsApp)

const ANGOLAN_PHONE_LENGTH = 12; // 244 + 9 dígitos
const ANGOLAN_PREFIX = '244';

/**
 * Extrai e normaliza o número de telefone a partir de um JID ou string.
 * Corrige bugs de encoding (ex.: JID @lid que devolve número incorreto).
 * @param {string} jid - remoteJid ou sender (ex: "244941713216@s.whatsapp.net" ou "251371634868240")
 * @returns {string} - Número limpo (ex: "244941713216") ou string vazia
 */
function extractPhoneNumber(jid) {
  if (jid == null || typeof jid !== 'string') return '';
  let raw = String(jid).trim();
  if (!raw) return '';

  // Se contém @, extrair tudo antes do @
  if (raw.includes('@')) {
    raw = raw.split('@')[0].trim();
  }

  // Apenas dígitos
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // Warning: possível encoding errado (ex.: LID que concatena algo)
  if (digits.length > 15) {
    console.warn(`[PHONE] JID com mais de 15 dígitos (possível encoding): "${jid}" → extraído "${digits}"`);
  }

  // Número angolano: 12 dígitos (244 + 9)
  if (digits.length === ANGOLAN_PHONE_LENGTH && digits.startsWith(ANGOLAN_PREFIX)) {
    return digits;
  }

  // Se parece ter 244 embutido, tentar extrair com regex
  const match = digits.match(/244\d{9}/);
  if (match) {
    return match[0];
  }

  // Sem 244: assumir que é número local (9 dígitos) e prefixar
  if (digits.length === 9 && !digits.startsWith('244')) {
    return ANGOLAN_PREFIX + digits;
  }

  // Número longo inválido: tentar últimos 12 dígitos se terminarem em 244XXXXXXXXX
  if (digits.length > ANGOLAN_PHONE_LENGTH) {
    const last12 = digits.slice(-12);
    if (last12.startsWith(ANGOLAN_PREFIX) && /^244\d{9}$/.test(last12)) {
      console.warn(`[PHONE] Número longo corrigido: "${digits}" → "${last12}"`);
      return last12;
    }
  }

  // Devolver tal como está (pode ser outro país); caller pode validar
  return digits;
}

module.exports = { extractPhoneNumber };
