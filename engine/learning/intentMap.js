// engine/learning/intentMap.js — mapeia strings da BD/CLI para intent canónico (sem depender de intentDetector)

'use strict';

const VALID = new Set([
  'INTENT_SUPORTE_CONTA',
  'INTENT_SUPORTE_CODIGO',
  'INTENT_SUPORTE_ERRO',
  'INTENT_SUPORTE_PAGAMENTO',
  'INTENT_SUPORTE_IMAGEM',
  'INTENT_VENDA',
  'INTENT_SAUDACAO',
  'INTENT_DESCONHECIDO',
]);

const ALIASES = {
  COMPRA: 'INTENT_VENDA',
  CONSULTA_PRECO: 'INTENT_VENDA',
  VENDA: 'INTENT_VENDA',
  SAUDACAO: 'INTENT_SAUDACAO',
  FAQ: 'INTENT_DESCONHECIDO',
  FORA_CONTEXTO: 'INTENT_DESCONHECIDO',
};

function resolveStoredIntent(raw) {
  const u = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!u) return 'INTENT_DESCONHECIDO';
  if (VALID.has(u)) return u;
  if (ALIASES[u]) return ALIASES[u];
  const prefixed = u.startsWith('INTENT_') ? u : `INTENT_${u}`;
  if (VALID.has(prefixed)) return prefixed;
  return 'INTENT_DESCONHECIDO';
}

module.exports = { resolveStoredIntent, VALID };
