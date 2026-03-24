// engine/llm/promptExtras.js — prefixo regras negativas + bloco iceberg de preços

'use strict';

const { formatCatalogIndexForPrompt } = require('../catalog/catalogIndex');
const { formatNegativeRulesSection, getTopRulesForPrompt } = require('../learning/negativeRules');

function buildNegativeRulesPrefix() {
  return formatNegativeRulesSection(getTopRulesForPrompt(20));
}

function buildIcebergPricingBlock(clientConfig, buildPricingTableFromSettings) {
  const iceberg = clientConfig && formatCatalogIndexForPrompt(clientConfig);
  if (iceberg) {
    return `[PREÇOS E PRODUTOS (índice leve — detalhes injectados na mensagem quando relevante)]\n${iceberg}\n`;
  }
  return `[TABELA DE PREÇOS BLINDADA]\n${buildPricingTableFromSettings()}\n`;
}

module.exports = { buildNegativeRulesPrefix, buildIcebergPricingBlock };
