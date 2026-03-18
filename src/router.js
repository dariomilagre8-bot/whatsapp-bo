// src/router.js — Registo de clientes (numero + slug) para o webhook / multi-instância
// Cada entrada: numero, slug, config (carregado de config/clientes/<slug>.js)

const demoModaConfig = require('../config/clientes/demo-moda');

module.exports = {
  clientes: {
    'demo-moda': {
      numero: '244958765478',
      slug: 'demo-moda',
      config: demoModaConfig,
      evolutionInstance: 'demo-moda',
    },
  },
};
