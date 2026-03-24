'use strict';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  };
}

function assert(c, m) { if (!c) throw new Error(m || 'fail'); }

let notifyCalls = 0;

function injectNotifyDonMock() {
  const p = require.resolve('../../../alerts/notifyDon');
  require.cache[p] = {
    id: p,
    filename: p,
    loaded: true,
    exports: {
      notifyDonRenewalSummary: async () => { notifyCalls++; },
    },
  };
}

function freshSender() {
  injectNotifyDonMock();
  delete require.cache[require.resolve('../../../renewal/renewalSender')];
  delete require.cache[require.resolve('../../../renewal/renewalMessages')];
  return require('../../../renewal/renewalSender');
}

console.log('\n🧪 TESTES — engine/renewal/renewalSender\n');

const clients = [
  { phone: '244911111111', name: 'Um', plan: 'X', expiry_date: '2026-03-31T23:59:59.000Z' },
  { phone: '244922222222', name: 'Dois', plan: 'Y', expiry_date: '2026-03-31T23:59:59.000Z' },
];

const tests = [];

tests.push(test('sendRenewalMessages: envia todos e reporta sent', async () => {
  notifyCalls = 0;
  const prevFetch = global.fetch;
  global.fetch = async () => ({ ok: true });
  process.env.EVOLUTION_API_URL = 'http://evo';
  process.env.EVOLUTION_API_KEY = 'k';
  process.env.RENEWAL_INSTANCE_NAME = 'Inst';
  const { sendRenewalMessages } = freshSender();
  const r = await sendRenewalMessages(clients, 'AVISO_DIA', { delayMs: 0, notifyDon: true });
  global.fetch = prevFetch;
  assert(r.sent === 2 && r.failed === 0, `sent=${r.sent} failed=${r.failed}`);
  assert(notifyCalls === 1, 'notifyDon uma vez por batch');
}));

tests.push(test('sendRenewalMessages: continua após falha e lista erros', async () => {
  notifyCalls = 0;
  const prevFetch = global.fetch;
  let n = 0;
  global.fetch = async () => {
    n++;
    if (n === 1) throw new Error('boom');
    return { ok: true };
  };
  process.env.EVOLUTION_API_URL = 'http://evo';
  process.env.EVOLUTION_API_KEY = 'k';
  process.env.RENEWAL_INSTANCE_NAME = 'Inst';
  const { sendRenewalMessages } = freshSender();
  const r = await sendRenewalMessages(clients, 'AVISO_DIA', { delayMs: 0 });
  global.fetch = prevFetch;
  assert(r.sent === 1 && r.failed === 1, `sent=${r.sent} failed=${r.failed}`);
  assert(r.errors.length === 1, 'errors');
  assert(r.succeededPhones.length === 1, 'succeededPhones');
}));

tests.push(test('sendRenewalMessages: dry-run não chama fetch nem notify', async () => {
  notifyCalls = 0;
  const prevFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; return { ok: true }; };
  const { sendRenewalMessages } = freshSender();
  await sendRenewalMessages([clients[0]], 'AVISO_3_DIAS', { dryRun: true, delayMs: 0 });
  global.fetch = prevFetch;
  assert(!fetchCalled, 'fetch não chamado');
  assert(notifyCalls === 0, 'notify não chamado');
}));

(async () => {
  for (const t of tests) await t();
  delete require.cache[require.resolve('../../../alerts/notifyDon')];
  console.log(`\n📊 renewalSender: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
