'use strict';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(c, m) { if (!c) throw new Error(m || 'fail'); }

const { matchesRenewalOffset } = require('../../../renewal/renewalDates');

console.log('\n🧪 TESTES — engine/renewal/renewalDates\n');

test('matchesRenewalOffset: hoje+3 = expiração em 3 dias (UTC)', () => {
  const now = new Date('2026-03-28T08:00:00.000Z');
  const exp = '2026-03-31T23:59:59.000Z';
  assert(matchesRenewalOffset(exp, 3, now), '28 Mar UTC → aviso 3d para 31 Mar');
});

test('matchesRenewalOffset: dia 0 = mesmo dia UTC', () => {
  const now = new Date('2026-03-31T10:00:00.000Z');
  const exp = '2026-03-31T23:59:59.000Z';
  assert(matchesRenewalOffset(exp, 0, now), 'mesmo dia calendário UTC');
});

test('matchesRenewalOffset: não confunde com +2 dias', () => {
  const now = new Date('2026-03-28T08:00:00.000Z');
  const exp = '2026-03-31T23:59:59.000Z';
  assert(!matchesRenewalOffset(exp, 2, now), 'não é +2');
});

console.log(`\n📊 renewalDates: ${passed} ok, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
