// engine/prompts/base.js — referência: prefixos dinâmicos vivem em engine/llm/promptExtras.js
// (regras negativas + bloco iceberg). O system prompt longo permanece em engine/lib/llm.js (buildDynamicPrompt).

'use strict';

const { buildNegativeRulesPrefix, buildIcebergPricingBlock } = require('../llm/promptExtras');

module.exports = { buildNegativeRulesPrefix, buildIcebergPricingBlock };
