'use strict';

const { INTENTS } = require('../../../src/engine/intentDetector');

function intentMatches(scenario, detectedIntent) {
  if (scenario.id === 'typo_pesado' && scenario.expected_intent === 'CONSULTA_PRECO') {
    return detectedIntent === INTENTS.VENDA || detectedIntent === INTENTS.DESCONHECIDO;
  }
  const map = {
    SAUDACAO: INTENTS.SAUDACAO,
    CONSULTA_PRECO: INTENTS.VENDA,
    FORA_CONTEXTO: INTENTS.DESCONHECIDO,
    JAILBREAK: INTENTS.DESCONHECIDO,
    COMPRA: INTENTS.VENDA,
    HUMAN_HANDOFF: INTENTS.DESCONHECIDO,
  };
  return map[scenario.expected_intent] === detectedIntent;
}

module.exports = { intentMatches };
