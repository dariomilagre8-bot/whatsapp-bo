// src/engine/intentDetector.js — Detecção de intenção (pré-LLM)
// CommonJS, Node.js 20
// BUG-074: suporte_conta só com padrões de alta confiança; VENDA_OVERRIDE tem precedência na ambiguidade.

const { matchNegativeRule } = require('../../engine/learning/negativeRules');
const { resolveStoredIntent } = require('../../engine/learning/intentMap');

const INTENTS = {
  SUPORTE_CONTA: 'INTENT_SUPORTE_CONTA',
  SUPORTE_CODIGO: 'INTENT_SUPORTE_CODIGO',
  SUPORTE_ERRO: 'INTENT_SUPORTE_ERRO',
  SUPORTE_PAGAMENTO: 'INTENT_SUPORTE_PAGAMENTO',
  SUPORTE_IMAGEM: 'INTENT_SUPORTE_IMAGEM',
  VENDA: 'INTENT_VENDA',
  SAUDACAO: 'INTENT_SAUDACAO',
  DESCONHECIDO: 'INTENT_DESCONHECIDO',
};

// BUG-067: \b em JS regex só reconhece [a-zA-Z0-9_] como word char.
function normalizePattern(str) {
  const UW = '[\\w\\u00C0-\\u024F]';
  return str
    .replace(/\\b(?=[\w\[(])/g, `(?<!${UW})`)
    .replace(/\\b/g, `(?!${UW})`);
}

/** StreamZone: escalação suporte_conta só com match inequívoco (BUG-074). */
const SUPORTE_HARD_PATTERNS = [
  /\b(código|codigo)\b.*\b(verificação|verificacao|entrar|login|acesso)\b/i,
  /\b(não|nao)\s+(consigo|funciona|entra|abre)\b/i,
  /\b(não|nao)\s+est[aá]\s+funcionando\b/i,
  /\b(expirou|venceu|acabou)\s+(o\s+)?(meu\s+)?(plano|acesso|conta)\b/i,
  /\b(meus?\s+)?(plano|acesso|conta)\s+(expirou|venceu|acabou)\b/i,
  /\b(o\s+)?(meu\s+)?(plano|acesso|conta)\s+(já\s+)?(expirou|venceu)\b/i,
  /\b(erro|problema|bug)\s+(na|no|com)\s+(conta|perfil|acesso)\b/i,
  /\b(bloqueado|bloqueada|suspens)/i,
  /\b(reembolso|devolver|dinheiro\s+de\s+volta)\b/i,
  /\b(household|limite\s+de\s+dispositivos)\b/i,
  /\b(paguei|pagamento).*(não|nao).*(recebi|chegou|activ|ativ)\b/i,
  /\b(reclamação|reclamar|queixar|reclamacao)\b/i,
  /\bmeu\s+plano\b.*\b(não|nao)\s+/i,
  /\bj[aá]\s+paguei\b/i,
  /\b(não|nao)\s+activ\b/i,
  /\b(não|nao)\s+ativ\b/i,
];

/**
 * Perguntas de venda / catálogo — têm precedência sobre suporte quando há ambiguidade.
 * Nota: omitido "para N pessoas" — contexto de sessão, deixar ao LLM (BUG-074).
 */
const VENDA_OVERRIDE_PATTERNS = [
  /\b(tem|têm|teem|existe|há)\s+(plano|pacote|opç[aã]o|opcao)\b/i,
  /\b(quanto|preço|preco|custa|valor)\s+(é|e|o|a|do|da|de)\b/i,
  /\bquanto\s+custa\b/i,
  /\b(quero|gostaria|preciso)\s+(de\s+)?(comprar|adquirir|assinar|aderir)\b/i,
  /\b(plano\s+de\s+\d+)\b/i,
  /\b(individual|partilha|fam[ií]lia|completa)\b/i,
  /\b(netflix|prime\s*video)\b.*\b(tem|preço|preco|quanto|plano)\b/i,
  /\b(tem\s+plano)\b/i,
  /\b(quero|gostaria)\s+(de\s+)?(mudar|trocar|alterar)\b/i,
];

/**
 * Perguntas de catálogo de streaming ("Têm pacotes do Disney?") — deixar ao LLM (BUG-074).
 * Não forçar INTENT_VENDA por "tem + pacote" quando há marca de serviço.
 */
function isStreamingCatalogPacoteQuestion(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  if (!/\b(tem|t[eê]m|teem|h[aá]|ha)\b/i.test(t)) return false;
  if (!/\bpacotes?\b/i.test(t)) return false;
  return /\b(disney|netflix|hbo|max\b|prime|paramount|apple\s*tv|discovery|crunchyroll|spotify)\b/i.test(t);
}

function matchesVendaOverride(text) {
  if (isStreamingCatalogPacoteQuestion(text)) return false;
  return VENDA_OVERRIDE_PATTERNS.some((p) => p.test(text));
}

function matchesSuporteHard(text) {
  return SUPORTE_HARD_PATTERNS.some((p) => p.test(text));
}

const rx = {
  suporteCodigo: /c[oó]digo|verifica[çc][aã]o|j[aá]\s*envie|pe[çc]a.*c[oó]digo|mand[ae].*c[oó]digo/i,
  suporteErro: /erro|localiza[çc][aã]o|n[aã]o\s*(consigo|funciona|abre|entra)|problema|n[aã]o\s*d[aá]|bugad/i,
  suportePagamento: /pag(amento|ar|uei)|renov(ar|a[çc][aã]o)|transfer[iê]|iban|comprovativo|deposit/i,
  venda: /\b(netflix|prime(\s*video)?|plano|pre[çc]o|quanto\s*custa|custa\s*quanto|cat[aá]logo|quero\s*(comprar|adquirir)|comprar|assinar)\b/i,
  saudacaoLinha: new RegExp(
    normalizePattern(
      '^(ol[aá]|ola|oi+|bom\\s+dia|boa\\s+tarde|boa\\s+noite|hey|hi|hello|e\\s*a[ií])(\\s*[!.?,]*)?$'
    ),
    'i'
  ),
  saudacaoComplemento: /^(bom\s+dia|boa\s+tarde|boa\s+noite)(\s+\S+){1,3}\s*$/i,
  ambiguoCurto: new RegExp(
    normalizePattern(
      '^(ok|pronto|aqui|segue|feito|ja\\s*(enviei|mandei)|j[aá]\\s*(enviei|mandei)|enviei|mandei|ta\\s*a[ií]|est[aá]\\s*a[ií])\\b'
    ),
    'i'
  ),
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
  const clientSlug = input?.clientSlug;

  const ruleHit = text && matchNegativeRule(text, clientSlug);
  if (ruleHit) {
    console.log(
      `Intent overridden by negative rule #${ruleHit.id}: '${ruleHit.input_pattern}' → ${ruleHit.correct_intent}`
    );
    return {
      intent: resolveStoredIntent(ruleHit.correct_intent),
      reason: 'negative_rule',
      confidence: 1,
      source: 'negative_rule',
      ruleId: ruleHit.id,
      matchedPattern: ruleHit.input_pattern,
    };
  }

  // ── BUG-074: StreamZone — suporte hard vs venda override (ambiguidade → venda, nunca escalar) ──
  if (text && clientSlug === 'streamzone') {
    const isVenda = matchesVendaOverride(text);
    const isSuporte = matchesSuporteHard(text);
    if (isVenda && isSuporte) {
      return { intent: INTENTS.VENDA, reason: 'ambiguous:prefer_venda' };
    }
    if (isSuporte) {
      return { intent: INTENTS.SUPORTE_CONTA, reason: 'pattern:suporte_conta_hard' };
    }
  }

  // Suporte código (todos os clientes)
  if (text && rx.suporteCodigo.test(text)) {
    return { intent: INTENTS.SUPORTE_CODIGO, reason: 'pattern:support_code' };
  }

  // Suporte erro
  if (text && rx.suporteErro.test(text)) {
    return { intent: INTENTS.SUPORTE_ERRO, reason: 'pattern:support_error' };
  }

  // Pagamento / renovação
  if (text && rx.suportePagamento.test(text)) {
    return { intent: INTENTS.SUPORTE_PAGAMENTO, reason: 'pattern:support_payment' };
  }

  // Imagem ambígua
  if (isImage && !isAudio && !isDocument) {
    const t = text;
    if (!t) return { intent: INTENTS.SUPORTE_IMAGEM, reason: 'image:no_text' };
    if (t.length < 10) return { intent: INTENTS.SUPORTE_IMAGEM, reason: 'image:short_text' };
    if (rx.ambiguoCurto.test(t)) return { intent: INTENTS.SUPORTE_IMAGEM, reason: 'image:ambiguous_text' };
  }

  // Venda: override explícito (todos os clientes) antes do regex genérico
  if (text && matchesVendaOverride(text)) {
    return { intent: INTENTS.VENDA, reason: 'pattern:venda_override' };
  }

  if (text && rx.venda.test(text)) {
    return { intent: INTENTS.VENDA, reason: 'pattern:sale' };
  }

  // Saudação
  if (text && (rx.saudacaoLinha.test(text) || rx.saudacaoComplemento.test(text))) {
    return { intent: INTENTS.SAUDACAO, reason: 'pattern:greeting' };
  }

  return { intent: INTENTS.DESCONHECIDO, reason: 'fallback:unknown' };
}

module.exports = {
  detectIntent,
  INTENTS,
  normalizePattern,
  SUPORTE_HARD_PATTERNS,
  VENDA_OVERRIDE_PATTERNS,
  isStreamingCatalogPacoteQuestion,
  matchesVendaOverride,
  matchesSuporteHard,
};
