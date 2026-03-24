'use strict';

const { detectIntent } = require('../../src/engine/intentDetector');
const { classifyWithGemini } = require('./intentGemini');

function regexFallbackConfidence(reason) {
  if (!reason) return 0.75;
  if (String(reason).includes('ambiguous')) return 0.55;
  if (String(reason).includes('fallback')) return 0.45;
  return 0.88;
}

/**
 * Ordem: regras negativas (sync) → Gemini Flash → regex.
 * @returns {Promise<{intent:string,confidence:number,reason:string,source?:string,ruleId?:number,matchedPattern?:string}>}
 */
async function classifyIntent(input) {
  const dr = detectIntent(input);
  if (dr.source === 'negative_rule') {
    return {
      intent: dr.intent,
      confidence: dr.confidence ?? 1,
      reason: 'negative_rule',
      source: 'negative_rule',
      ruleId: dr.ruleId,
      matchedPattern: dr.matchedPattern,
    };
  }

  const text = input?.text;
  if (typeof text === 'string' && text.trim()) {
    try {
      const g = await classifyWithGemini(text);
      if (g) return { ...g, source: 'gemini' };
    } catch (e) {
      console.warn('[INTENT] Gemini indisponível, fallback regex:', e.message);
    }
  }

  return {
    intent: dr.intent,
    confidence: regexFallbackConfidence(dr.reason),
    reason: dr.reason || 'regex',
    source: 'regex',
  };
}

module.exports = { classifyIntent };
