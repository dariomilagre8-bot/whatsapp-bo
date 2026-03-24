#!/usr/bin/env node
// Raiz: node outreach.js … — outreach manual (mensagens preparadas; envio humano no WhatsApp)

const { run } = require('./engine/outreach/cli');

run(process.argv.slice(2)).catch((e) => {
  console.error('[outreach]', e.message || e);
  process.exit(1);
});
