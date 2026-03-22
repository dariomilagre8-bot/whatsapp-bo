// clients/luna/config.js — Bot comercial Palanca (Luna)
// Multi-tenant: mesma estrutura que clients/streamzone/config.js

const base = require('../../config/luna');

module.exports = {
  ...base,

  // ═══════ MULTI-TENANT (engine routing) ═══════
  slug: 'luna',
  whatsappBusiness: '351934937617',
  supervisors: ['244941713216'],
  evolutionInstance: 'ZapPrincipal',
  modules: {
    faq: true,
    catalog: true,
    sales: true,
    stock: false,
    supervisor: true,
    followup: false,
    waitlist: false,
    reports: false,
    crm: false,
    leads: false,
  },
  catalogSource: 'static',
  prices: {
    Starter: 22000,
    Essencial: 45000,
    Profissional: 80000,
    Empresarial: 135000,
  },
  currency: 'Kz',
  language: 'pt-AO',
  timezone: 'Africa/Luanda',
};
