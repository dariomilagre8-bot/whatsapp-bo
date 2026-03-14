// config/clientes.js — Mapeamento instância Evolution → config por cliente (multi-instância)
// O webhook usa body.instance (ou body.provider?.instance) para escolher a config.
// Supabase, Sheets e Gemini são partilhados (do .env).

module.exports = {
  'Zara-Teste': {
    botName: 'Zara',
    supervisores: ['244941713216', '251371634868240'],
  },
  'Streamzone Braulio': {
    botName: 'Zara',
    supervisores: ['244941529470', '244941713216'],
  },
};
