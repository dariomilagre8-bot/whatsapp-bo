// src/engine/intentDetector.js — Detecção de intenção (pré-LLM)
// CommonJS, Node.js 20

const INTENTS = {
  SUPORTE_CODIGO: 'INTENT_SUPORTE_CODIGO',
  SUPORTE_ERRO: 'INTENT_SUPORTE_ERRO',
  SUPORTE_PAGAMENTO: 'INTENT_SUPORTE_PAGAMENTO',
  SUPORTE_IMAGEM: 'INTENT_SUPORTE_IMAGEM',
  VENDA: 'INTENT_VENDA',
  SAUDACAO: 'INTENT_SAUDACAO',
  DESCONHECIDO: 'INTENT_DESCONHECIDO',
};

const rx = {
  suporteCodigo: /c[oó]digo|verifica[çc][aã]o|j[aá]\s*envie|pe[çc]a.*c[oó]digo|mand[ae].*c[oó]digo/i,
  suporteErro: /erro|localiza[çc][aã]o|n[aã]o\s*(consigo|funciona|abre|entra)|problema|n[aã]o\s*d[aá]|bugad/i,
  suportePagamento: /pag(amento|ar|uei)|renov(ar|a[çc][aã]o)|transfer[iê]|iban|comprovativo|deposit/i,
  // Venda (bem explícito) — não deve apanhar suporte genérico
  venda: /\b(netflix|prime(\s*video)?|plano|pre[çc]o|quanto\s*custa|custa\s*quanto|cat[aá]logo|quero\s*(comprar|adquirir)|comprar|assinar)\b/i,
  saudacao: /^(ol[aá]|ola|oi+|bom dia|boa tarde|boa noite|hey|hi|hello)\b/i,
  // Texto curto/ambíguo comum quando enviam print/ficheiro
  ambiguoCurto: /^(ok|pronto|aqui|segue|feito|ja\s*(enviei|mandei)|j[aá]\s*(enviei|mandei)|enviei|mandei|ta\s*a[ií]|est[aá]\s*a[ií])\b/i,
};

function safeText(text) {
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * @param {Object} input
 * @param {string} input.text
 * @param {boolean} input.isImage
 * @param {boolean} input.isAudio
 * @param {boolean} input.isDocument
 * @returns {{ intent: string, reason: string }}
 */
function detectIntent(input) {
  const text = safeText(input?.text);
  const isImage = !!input?.isImage;
  const isAudio = !!input?.isAudio;
  const isDocument = !!input?.isDocument;

  // 2º prioridade: suporte código
  if (text && rx.suporteCodigo.test(text)) return { intent: INTENTS.SUPORTE_CODIGO, reason: 'pattern:support_code' };

  // 3º prioridade: suporte erro
  if (text && rx.suporteErro.test(text)) return { intent: INTENTS.SUPORTE_ERRO, reason: 'pattern:support_error' };

  // 4º prioridade: pagamento/renovação (segue funil existente)
  if (text && rx.suportePagamento.test(text)) return { intent: INTENTS.SUPORTE_PAGAMENTO, reason: 'pattern:support_payment' };

  // 5º prioridade: imagem sem contexto/ambígua
  if (isImage && !isAudio && !isDocument) {
    const t = text;
    if (!t) return { intent: INTENTS.SUPORTE_IMAGEM, reason: 'image:no_text' };
    if (t.length < 10) return { intent: INTENTS.SUPORTE_IMAGEM, reason: 'image:short_text' };
    if (rx.ambiguoCurto.test(t)) return { intent: INTENTS.SUPORTE_IMAGEM, reason: 'image:ambiguous_text' };
  }

  // 6º: venda explícita
  if (text && rx.venda.test(text)) return { intent: INTENTS.VENDA, reason: 'pattern:sale' };

  // 7º: saudação
  if (text && rx.saudacao.test(text)) return { intent: INTENTS.SAUDACAO, reason: 'pattern:greeting' };

  // 8º: desconhecido — deixa o LLM ajudar, mas sem assumir venda
  return { intent: INTENTS.DESCONHECIDO, reason: 'fallback:unknown' };
}

module.exports = { detectIntent, INTENTS };

