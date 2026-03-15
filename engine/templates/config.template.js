// clients/{{SLUG}}/config.js — Gerado por engine/scripts/novo-cliente.sh
const base = require('../../config/streamzone');

module.exports = {
  ...base,
  slug: '{{SLUG}}',
  whatsappBusiness: '{{WHATSAPP_NUMBER}}',
  supervisors: ['{{SUPERVISOR_NUMBER}}'],
  evolutionInstance: '{{EVOLUTION_INSTANCE}}',
  identity: {
    ...base.identity,
    botName: '{{BOT_NAME}}',
    businessName: '{{BUSINESS_NAME}}',
  },
};
