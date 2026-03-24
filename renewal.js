#!/usr/bin/env node
// Raiz: node renewal.js … — avisos de renovação (pa_clients + Evolution)

const { run } = require('./engine/renewal/renewalCli');

run(process.argv.slice(2)).catch((e) => {
  console.error('[renewal]', e.message || e);
  process.exit(1);
});
