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

const { parseArgs } = require('../../../renewal/renewalCli');

console.log('\n🧪 TESTES — engine/renewal/renewalCli\n');

const tests = [];

tests.push(test('parseArgs: --check, --dry-run, --send-now, template, phone', () => {
  const a = parseArgs(['--check']);
  assert(a.check && !a.dryRun, 'check');
  const b = parseArgs(['--dry-run']);
  assert(b.dryRun, 'dry');
  const c = parseArgs(['--send-now', '--template=AVISO_DIA']);
  assert(c.sendNow && c.template === 'AVISO_DIA', 'send');
  const d = parseArgs(['--mark-renewed', '--phone=2449']);
  assert(d.markRenewed && d.phone === '2449', 'mark');
}));

tests.push(test('run --check lista cohortes (mock supabase)', async () => {
  const rows = [
    { phone: '244900000001', name: 'A', status: 'active', expiry_date: '2026-03-31T23:59:59.000Z' },
  ];
  const supPath = require.resolve('../../../lib/supabase');
  require.cache[supPath] = {
    id: supPath,
    filename: supPath,
    loaded: true,
    exports: {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    },
  };
  delete require.cache[require.resolve('../../../renewal/renewalCheck')];
  delete require.cache[require.resolve('../../../renewal/renewalCli')];
  const { run } = require('../../../renewal/renewalCli');
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...a) {
      if (a.length === 0) super('2026-03-31T10:00:00.000Z');
      else super(...a);
    }
    static now() { return new RealDate('2026-03-31T10:00:00.000Z').getTime(); }
  };
  let out = '';
  const log = console.log;
  console.log = (...x) => { out += x.join(' ') + '\n'; };
  process.env.SUPABASE_URL = 'http://x';
  process.env.SUPABASE_KEY = 'k';
  await run(['--check']);
  console.log = log;
  global.Date = RealDate;
  delete require.cache[supPath];
  delete require.cache[require.resolve('../../../renewal/renewalCheck')];
  delete require.cache[require.resolve('../../../renewal/renewalCli')];
  assert(out.includes('AVISO_DIA'), out);
  assert(out.includes('A'), out);
}));

(async () => {
  for (const t of tests) await t();
  console.log(`\n📊 renewalCli: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
