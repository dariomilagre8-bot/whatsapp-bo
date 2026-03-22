// config/clientes.js — Mapeamento instância Evolution → config por cliente (multi-instância)
// O webhook usa body.instance (ou body.provider?.instance) para escolher a config.
// Supabase, Sheets e Gemini são partilhados (do .env).

module.exports = {
  'Zara-Teste': {
    botName: 'Zara',
    supervisores: ['244946014060', '251371634868240'],
  },
  'Streamzone Braulio': {
    botName: 'Zara',
    supervisores: ['244946014060'],
  },
  'demo-moda': {
    botName: 'Bia',
    supervisores: ['244941713216'],
  },
  ZapPrincipal: {
    botName: 'Luna',
    supervisores: ['244941713216'],
  },
};
