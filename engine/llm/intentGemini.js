'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { INTENTS } = require('../../src/engine/intentDetector');

const VALID = new Set(Object.values(INTENTS));
const MODEL = 'gemini-2.5-flash';

const PROMPT = `Classifica a mensagem do utilizador numa única intenção (exactamente um destes valores):
INTENT_SAUDACAO, INTENT_VENDA, INTENT_SUPORTE_CONTA, INTENT_SUPORTE_CODIGO, INTENT_SUPORTE_ERRO, INTENT_SUPORTE_PAGAMENTO, INTENT_SUPORTE_IMAGEM, INTENT_DESCONHECIDO
Responde APENAS JSON: {"intent":"...","confidence":0.0-1.0}
Mensagem:`;

function parseJson(raw) {
  const t = (raw || '').trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch (_) {
    return null;
  }
}

/**
 * Classificação via Gemini Flash (não raciocínio longo).
 * @returns {Promise<{intent:string,confidence:number,reason:string}|null>}
 */
async function classifyWithGemini(text) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || process.env.INTENT_REGEX_ONLY === 'true') return null;

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: MODEL });
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n"""${String(text || '').slice(0, 2000)}"""` }] }],
    generationConfig: { maxOutputTokens: 128, temperature: 0.1 },
  });
  const raw = res.response.text();
  const j = parseJson(raw);
  if (!j || !VALID.has(j.intent)) return null;
  const confidence = Math.min(1, Math.max(0, Number(j.confidence) || 0.75));
  return { intent: j.intent, confidence, reason: 'gemini:classify' };
}

module.exports = { classifyWithGemini, MODEL };
