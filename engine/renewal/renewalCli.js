// engine/renewal/renewalCli.js — CLI manual (node renewal.js …)

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const supabaseIntegration = require('../../src/integrations/supabase');
const { getClientsForRenewal, getExpiredClients, markClientStatus } = require('./renewalCheck');
const { sendRenewalMessages } = require('./renewalSender');

function parseArgs(argv) {
  const o = { check: false, dryRun: false, sendNow: false, template: 'AVISO_3_DIAS', phone: null, markRenewed: false };
  for (const a of argv) {
    if (a === '--check') o.check = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--send-now') o.sendNow = true;
    else if (a === '--mark-renewed') o.markRenewed = true;
    else if (a.startsWith('--template=')) o.template = a.slice(11).toUpperCase();
    else if (a.startsWith('--phone=')) o.phone = a.slice(8).replace(/^"|"$/g, '');
  }
  return o;
}

function initSb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_KEY (ou SERVICE_KEY) são obrigatórios');
  supabaseIntegration.init(url, key);
}

async function run(argv) {
  const args = parseArgs(argv);
  const needsSb =
    args.markRenewed || args.check || args.dryRun || args.sendNow;

  if (args.markRenewed) {
    initSb();
    if (!args.phone) throw new Error('Uso: node renewal.js --mark-renewed --phone=244…');
    await markClientStatus(args.phone, 'renewed');
    console.log(`[RENEWAL] Cliente ${args.phone} marcado como renewed.`);
    return;
  }

  if (args.check) {
    initSb();
    const d3 = await getClientsForRenewal(3);
    const d0 = await getClientsForRenewal(0);
    const ex = await getExpiredClients();
    console.log('[RENEWAL] --check (cohortes se o cron corresse hoje)\n');
    console.log(`AVISO_3_DIAS (${d3.length}):`, d3.map((c) => `${c.name} (${c.phone})`).join(', ') || '(nenhum)');
    console.log(`AVISO_DIA (${d0.length}):`, d0.map((c) => `${c.name} (${c.phone})`).join(', ') || '(nenhum)');
    console.log(`EXPIRADO (${ex.length}):`, ex.map((c) => `${c.name} (${c.phone})`).join(', ') || '(nenhum)');
    return;
  }

  if (args.dryRun) {
    initSb();
    const d3 = await getClientsForRenewal(3);
    const d0 = await getClientsForRenewal(0);
    const ex = await getExpiredClients();
    if (d3.length) await sendRenewalMessages(d3, 'AVISO_3_DIAS', { dryRun: true, notifyDon: false });
    if (d0.length) await sendRenewalMessages(d0, 'AVISO_DIA', { dryRun: true, notifyDon: false });
    if (ex.length) await sendRenewalMessages(ex, 'EXPIRADO', { dryRun: true, notifyDon: false });
    if (!d3.length && !d0.length && !ex.length) console.log('[dry-run] Nenhum cliente na janela.');
    return;
  }

  if (args.sendNow) {
    initSb();
    const tpl = args.template;
    if (!['AVISO_3_DIAS', 'AVISO_DIA', 'EXPIRADO'].includes(tpl)) {
      throw new Error('template deve ser AVISO_3_DIAS, AVISO_DIA ou EXPIRADO');
    }
    let list = [];
    if (tpl === 'AVISO_3_DIAS') list = await getClientsForRenewal(3);
    else if (tpl === 'AVISO_DIA') list = await getClientsForRenewal(0);
    else list = await getExpiredClients();
    if (!list.length) {
      console.log('[RENEWAL] Nenhum cliente para este template agora.');
      return;
    }
    const r = await sendRenewalMessages(list, tpl, { notifyDon: true });
    console.log('[RENEWAL] --send-now concluído:', r);
    return;
  }

  if (!needsSb) {
    console.log(`Uso:
  node renewal.js --check
  node renewal.js --dry-run
  node renewal.js --send-now --template=AVISO_3_DIAS
  node renewal.js --mark-renewed --phone=244…`);
  }
}

module.exports = { run, parseArgs };
