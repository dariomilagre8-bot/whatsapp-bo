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

let mockRows = [];

function injectSupabaseMock() {
  const supPath = require.resolve('../../../lib/supabase');
  require.cache[supPath] = {
    id: supPath,
    filename: supPath,
    loaded: true,
    exports: {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: mockRows, error: null }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
    },
  };
}

function freshRenewalCheck() {
  injectSupabaseMock();
  delete require.cache[require.resolve('../../../renewal/renewalCheck')];
  delete require.cache[require.resolve('../../../renewal/renewalDates')];
  return require('../../../renewal/renewalCheck');
}

console.log('\n🧪 TESTES — engine/renewal/renewalCheck\n');

const tests = [];

tests.push(test('getClientsForRenewal(3) filtra por dia UTC +3', async () => {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...a) {
      if (a.length === 0) super('2026-03-28T08:00:00.000Z');
      else super(...a);
    }
    static now() { return new RealDate('2026-03-28T08:00:00.000Z').getTime(); }
  };
  mockRows = [
    { phone: '244900000001', name: 'A', status: 'active', expiry_date: '2026-03-31T23:59:59.000Z' },
    { phone: '244900000002', name: 'B', status: 'active', expiry_date: '2026-04-01T12:00:00.000Z' },
  ];
  const { getClientsForRenewal } = freshRenewalCheck();
  const list = await getClientsForRenewal(3);
  global.Date = RealDate;
  assert(list.length === 1 && list[0].name === 'A', 'só expiração 31 Mar');
}));

tests.push(test('getClientsForRenewal(0) — dia da expiração', async () => {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...a) {
      if (a.length === 0) super('2026-03-31T10:00:00.000Z');
      else super(...a);
    }
    static now() { return new RealDate('2026-03-31T10:00:00.000Z').getTime(); }
  };
  mockRows = [
    { phone: '244900000001', name: 'A', status: 'active', expiry_date: '2026-03-31T23:59:59.000Z' },
  ];
  const { getClientsForRenewal } = freshRenewalCheck();
  const list = await getClientsForRenewal(0);
  global.Date = RealDate;
  assert(list.length === 1, 'hoje = dia de expiração');
}));

tests.push(test('getExpiredClients devolve active com expiry < now', async () => {
  mockRows = [
    { phone: '244900000001', name: 'Velho', status: 'active', expiry_date: '2020-01-01T00:00:00.000Z' },
    { phone: '244900000002', name: 'Futuro', status: 'active', expiry_date: '2030-01-01T00:00:00.000Z' },
  ];
  const { getExpiredClients } = freshRenewalCheck();
  const list = await getExpiredClients();
  assert(list.length === 1 && list[0].name === 'Velho', 'só expirados');
}));

tests.push(test('markClientStatus chama update', async () => {
  mockRows = [];
  const { markClientStatus } = freshRenewalCheck();
  await markClientStatus('244923335740', 'renewed');
}));

tests.push(test('exclui RENEWAL_SKIP_PHONE (Don)', async () => {
  process.env.RENEWAL_SKIP_PHONE = '244941713216';
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...a) {
      if (a.length === 0) super('2026-03-31T10:00:00.000Z');
      else super(...a);
    }
    static now() { return new RealDate('2026-03-31T10:00:00.000Z').getTime(); }
  };
  mockRows = [
    { phone: '244941713216', name: 'Don', status: 'active', expiry_date: '2026-03-31T23:59:59.000Z' },
    { phone: '244911111111', name: 'Cli', status: 'active', expiry_date: '2026-03-31T23:59:59.000Z' },
  ];
  const { getClientsForRenewal } = freshRenewalCheck();
  const list = await getClientsForRenewal(0);
  global.Date = RealDate;
  delete process.env.RENEWAL_SKIP_PHONE;
  assert(list.length === 1 && list[0].phone === '244911111111', 'Don excluído');
}));

(async () => {
  for (const t of tests) await t();
  delete require.cache[require.resolve('../../../lib/supabase')];
  console.log(`\n📊 renewalCheck: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
