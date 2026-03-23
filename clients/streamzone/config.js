// clients/streamzone/config.js — Configuração completa StreamZone Connect (Bot: Zara)
// Multi-tenant: identidade, números, estados, respostas fixas — engine usa zero strings de cliente
// Suporte conta (pré-LLM): base.accountSupport + INTENT_SUPORTE_CONTA em src/engine/intentDetector.js

const base = require('../../config/streamzone');

module.exports = {
  ...base,

  // ═══════ MULTI-TENANT (engine routing) ═══════
  slug: 'streamzone',
  whatsappBusiness: process.env.WHATSAPP_BUSINESS || '244941529470',
  supervisors: base.supervisorNumber
    ? [base.supervisorNumber]
    : (process.env.SUPERVISOR_NUMBERS
      ? process.env.SUPERVISOR_NUMBERS.split(',').map(s => s.trim()).filter(Boolean)
      : ['244946014060']),
  evolutionInstance: process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'Streamzone Braulio',
};
