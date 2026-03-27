// services/watchtower/analyze.js — Fase 1: análise puramente por contagens SQL (sem LLM)
'use strict';

// Palavras-chave de sentimento PT Angola (lowercase)
const POSITIVE_WORDS = [
  'obrigado', 'obrigada', 'bom', 'boa', 'óptimo', 'excelente', 'perfeito',
  'grato', 'grata', 'funciona', 'funcionou', 'recebeu', 'chegou', 'ok',
  'fixe', 'top', 'satisfeito', 'satisfeita', 'feliz', 'parabéns', 'boa tarde',
  'boa noite', 'bom dia', 'massa', 'deal',
];

const NEGATIVE_WORDS = [
  'problema', 'erro', 'não funciona', 'nao funciona', 'falhou', 'falha',
  'demora', 'demoro', 'cancelar', 'cancelei', 'cancelamento', 'chateado',
  'raiva', 'impossível', 'péssimo', 'horrível', 'lento', 'reclamação',
  'reclamar', 'insatisfeito', 'insatisfeita', 'não recebi', 'nao recebi',
  'sem sinal', 'caiu', 'bugado', 'bug',
];

/**
 * Classifica sentimento básico de um texto (lowercase).
 */
function classifySentiment(text) {
  if (!text) return 'neutral';
  const lower = String(text).toLowerCase();
  const hasPos = POSITIVE_WORDS.some(w => lower.includes(w));
  const hasNeg = NEGATIVE_WORDS.some(w => lower.includes(w));
  if (hasNeg) return 'negative';
  if (hasPos) return 'positive';
  return 'neutral';
}

/**
 * Extrai top_products a partir das mensagens de intenção INTENT_VENDA.
 * Conta frequência de termos-chave de produto no texto.
 */
function extractTopProducts(intentRows) {
  const freq = {};
  for (const row of intentRows) {
    const text = (row.message_text || '').toLowerCase();
    // Termos simples de produto (mínimo 4 chars, sem stop words)
    const tokens = text.match(/\b[a-záàãâéèêíóôõúç]{4,}\b/g) || [];
    const stopWords = new Set(['para', 'como', 'qual', 'quero', 'queria', 'tenho', 'você',
      'voce', 'esse', 'essa', 'este', 'esta', 'mais', 'menos', 'pelo', 'pela', 'pode', 'quero']);
    for (const t of tokens) {
      if (stopWords.has(t)) continue;
      freq[t] = (freq[t] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([product, count]) => ({ product, count }));
}

/**
 * Analisa dados extraídos e produz objecto pronto para inserir em pa_daily_insights.
 * @param {object} extracted - resultado de extractForClient()
 * @returns {object} registo para pa_daily_insights
 */
function analyze(extracted) {
  const {
    client_slug,
    date,
    messages_total,
    messages_from_clients,
    sales_completed,
    sales_abandoned,
    raw_intent_rows = [],
  } = extracted;

  let positive = 0;
  let negative = 0;
  let neutral  = 0;

  for (const row of raw_intent_rows) {
    const sentiment = classifySentiment(row.message_text);
    if (sentiment === 'positive') positive++;
    else if (sentiment === 'negative') negative++;
    else neutral++;
  }

  const top_products = extractTopProducts(raw_intent_rows);

  return {
    client_slug,
    date,
    messages_total,
    messages_from_clients,
    sales_completed,
    sales_abandoned,
    sentiment_positive: positive,
    sentiment_negative: negative,
    sentiment_neutral:  neutral,
    top_products,
    loss_reasons: [],            // Fase 2: LLM Map-Reduce
    avg_response_time_ms: null,  // Fase 2: calcular de pa_daily_insights.response_time_ms
  };
}

module.exports = { analyze, classifySentiment, extractTopProducts };
