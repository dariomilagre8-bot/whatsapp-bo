'use strict';

const { INTENTS } = require('../src/engine/intentDetector');
const { insertPaKpiRow } = require('./lib/paKpiInsert');

/** Iceberg: VENDA → JSON do produto ou instrução + índice leve. */
function prepareLlmUserMessage(intent, textMessage, clientConfig) {
  const text = String(textMessage || '');
  if (intent !== INTENTS.VENDA || !clientConfig) return { userMessage: text };
  try {
    const { formatCatalogIndexForPrompt } = require('./catalog/catalogIndex');
    const { getProductDetails, extractProductQuery } = require('./catalog/catalogLookup');
    const q = extractProductQuery(text);
    const details = getProductDetails(clientConfig, q);
    if (details) {
      return { userMessage: `${text}\n\nContexto do produto pedido: ${JSON.stringify(details)}` };
    }
    const summary = formatCatalogIndexForPrompt(clientConfig);
    if (summary) {
      return {
        userMessage:
          `${text}\n\n[Catálogo] Produto não identificado no índice. Responde com lista breve e uma pergunta curta. ${summary}`,
      };
    }
  } catch (_) {
    /* catálogo opcional */
  }
  return { userMessage: text };
}

function deriveResolutionType({ pausedAfter, hadEscalationTag, llmUsed }) {
  if (hadEscalationTag || pausedAfter) return 'human_escalated';
  if (llmUsed) return 'bot_resolved';
  return 'abandoned';
}

/**
 * @param {object} p
 * @param {string} p.clientId — slug (streamzone, luna, demo)
 * @param {number} p.responseTimeMs
 * @param {string|null} p.llmProvider — 'claude' | 'gemini'
 * @param {boolean} p.llmSuccess
 * @param {string} p.intentDetected
 * @param {number} p.intentConfidence
 * @param {string} p.resolutionType
 * @param {string} p.llmRoutingReason
 * @param {number|null} p.tokensUsed
 * @param {string|null} p.traceId
 * @param {string|null} p.phone
 */
function buildKpiInsertPayload(p) {
  return {
    client_id: p.clientId,
    client_slug: p.clientId,
    response_time_ms: p.responseTimeMs,
    llm_provider: p.llmProvider,
    llm_success: p.llmSuccess,
    intent_detected: p.intentDetected,
    intent_confidence: p.intentConfidence,
    resolution_type: p.resolutionType,
    llm_routing_reason: p.llmRoutingReason,
    tokens_used: p.tokensUsed ?? null,
    trace_id: p.traceId || null,
    phone: p.phone || null,
  };
}

function recordMessageKpi(p) {
  insertPaKpiRow(buildKpiInsertPayload(p));
}

module.exports = {
  recordMessageKpi,
  deriveResolutionType,
  prepareLlmUserMessage,
  buildKpiInsertPayload,
};
