'use strict';

const { INTENTS } = require('../../src/engine/intentDetector');

/**
 * Roteamento 60/30/10 (Gemini Flash vs Claude Sonnet 4).
 * Só retorna decisão — o chamador executa o LLM.
 * @param {string} intent — valor de INTENTS.*
 * @param {object} [messageContext]
 * @param {number} [messageContext.confidence]
 * @param {number} [messageContext.historyLen]
 * @param {boolean} [messageContext.pendingSale]
 */
function routeToModel(intent, messageContext = {}) {
  const conf = messageContext.confidence != null ? Number(messageContext.confidence) : 0.85;
  if (Number.isFinite(conf) && conf < 0.7) {
    return { model: 'claude-sonnet-4', reason: 'complex' };
  }

  if (intent === INTENTS.SUPORTE_CONTA || intent === INTENTS.SUPORTE_ERRO) {
    return { model: 'claude-sonnet-4', reason: 'complex' };
  }

  if (
    intent === INTENTS.SUPORTE_CODIGO
    || intent === INTENTS.SUPORTE_PAGAMENTO
    || intent === INTENTS.SUPORTE_IMAGEM
  ) {
    return { model: 'claude-sonnet-4', reason: 'medium' };
  }

  if (intent === INTENTS.VENDA) {
    const multi = (messageContext.historyLen || 0) >= 2 || !!messageContext.pendingSale;
    if (multi) return { model: 'claude-sonnet-4', reason: 'medium' };
    return { model: 'gemini-flash', reason: 'simple' };
  }

  if (intent === INTENTS.SAUDACAO) {
    return { model: 'gemini-flash', reason: 'simple' };
  }

  return { model: 'gemini-flash', reason: 'simple' };
}

module.exports = { routeToModel };
