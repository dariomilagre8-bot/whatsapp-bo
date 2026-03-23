// engine/lib/safe-guard.js — Anti-alucinação + filtro de emojis
// CommonJS, Node.js 20

/**
 * Padrões de respostas perigosas que NUNCA devem chegar ao cliente.
 * Qualquer resposta LLM que faça match é substituída pela mensagem de escalação.
 */
const DANGEROUS_PATTERNS = [
  /n[aã]o\s*temos?\s*(planos?|vagas?|slots?)\s*(dispon[ií]veis?|de\s*momento)?/i,
  /n[aã]o\s*temos?\s*dispon[ií]veis?/i,
  /n[aã]o\s*(oferecemos?|possu[ií]mos?|disponibilizamos?)/i,
  /de\s*momento\s*n[aã]o\s*(temos?|dispomos?|oferecemos?)/i,
  /infelizmente\s*n[aã]o\s*(temos?|dispomos?|há)/i,
  /n[aã]o\s*h[aá]\s*(planos?|vagas?|disponibilidade)/i,
  /sem\s*(planos?|vagas?)\s*dispon[ií]veis?/i,
];

/**
 * Verifica se uma resposta é segura para enviar ao cliente.
 * Retorna false se a resposta contiver padrões perigosos (alucinação de indisponibilidade).
 * @param {string} response
 * @returns {boolean}
 */
function isSafeResponse(response) {
  if (typeof response !== 'string' || !response.trim()) return true;
  return !DANGEROUS_PATTERNS.some(p => p.test(response));
}

/**
 * Remove emojis Unicode de uma string de texto.
 * Aplicar APENAS para clientes com noEmoji: true no config.
 * @param {string} text
 * @returns {string}
 */
function removeEmojis(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')   // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')   // Símbolos / pictogramas
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')   // Transporte / mapa
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')   // Bandeiras
    .replace(/[\u{2600}-\u{26FF}]/gu, '')      // Símbolos miscelâneos
    .replace(/[\u{2700}-\u{27BF}]/gu, '')      // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')      // Selectores de variação
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')    // Símbolos suplementares
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')    // Símbolos estendidos-A
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')    // Símbolos estendidos-B
    .replace(/[\u{200D}]/gu, '')               // Zero-width joiner
    .replace(/[\u{20E3}]/gu, '')               // Combining enclosing keycap
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * Mensagem de fallback segura para substituir respostas perigosas.
 */
const SAFE_FALLBACK = 'Vou encaminhar a sua questão ao nosso responsável para garantir a melhor resposta. Aguarde um momento, por favor.';

module.exports = { isSafeResponse, removeEmojis, SAFE_FALLBACK, DANGEROUS_PATTERNS };
