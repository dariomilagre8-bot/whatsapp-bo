#!/usr/bin/env node
// scripts/test-cron-renovacao.js
// Testa a lógica do cron de renovação SEM enviar mensagens reais.
// Usa DRY_RUN=true para apenas logar o que FARIA.
//
// Uso: node scripts/test-cron-renovacao.js
// Ou:  DRY_RUN=true node scripts/test-cron-renovacao.js

require('dotenv').config();
process.env.DRY_RUN = 'true';

const path = require('path');
const config = require('../config/streamzone');

// Patch sendRenewalWhatsApp para não enviar mensagens reais em DRY_RUN
const renewalModule = require('../src/renewal/renewal-cron');
const originalSend = renewalModule.sendRenewalWhatsApp;

// Monkey-patch: intercepta envios e loga em vez de enviar
renewalModule.sendRenewalWhatsApp = async function(phone, text) {
  if (process.env.DRY_RUN === 'true') {
    console.log(`\n  [DRY RUN] Enviaria para ${phone}:`);
    console.log(`  "${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`);
    return true; // simula sucesso
  }
  return originalSend(phone, text);
};

const { createClient } = require('@supabase/supabase-js');

async function main() {
  console.log('\n🧪 Teste cron renovação (DRY RUN)');
  console.log('==================================');
  console.log('ℹ️  Nenhuma mensagem será enviada.\n');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.warn('⚠️  SUPABASE_URL / SUPABASE_KEY não definidos — Supabase não disponível');
  }

  const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

  const stockConfig = config.stock;
  const paymentConfig = config.payment;

  if (!stockConfig) {
    console.error('❌ config.stock não encontrado em config/streamzone.js');
    process.exit(1);
  }

  try {
    await renewalModule.runDailyRenewalJob(stockConfig, paymentConfig, supabase, { force: true });
    console.log('\n✅ Cron executou sem erros');
  } catch (e) {
    console.error('\n❌ Cron falhou:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

main();
