// clients/demo/config.js — Loja Demo (Bia), instância Evolution demo-moda
// Multi-tenant: mesma estrutura que clients/streamzone/config.js

const base = require('../../config/demo');

module.exports = {
  ...base,

  // ═══════ MULTI-TENANT (engine routing) ═══════
  slug: 'demo-moda',
  whatsappBusiness: '244958765478',
  supervisors: ['244941713216'],
  evolutionInstance: 'demo-moda',
  modules: {
    faq: true,
    catalog: true,
    sales: true,
    stock: true,
    supervisor: true,
    followup: true,
    waitlist: true,
    reports: true,
    crm: true,
    leads: true,
  },
  catalogSource: 'static',
  prices: {
    'Camisola Básica': 3500,
    'Vestido Elegante': 8000,
    'Calças Jeans': 5500,
    'Sapatos Desportivos': 7000,
    'Bolsa Feminina': 4500,
  },
  currency: 'Kz',
  language: 'pt-AO',
  timezone: 'Africa/Luanda',
};
