'use strict';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log(`  ✅ ${name}`); passed++; })
        .catch((err) => { console.log(`  ❌ ${name}: ${err.message}`); failed++; });
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

function assert(c, m) { if (!c) throw new Error(m || 'fail'); }

const { renderRenewalMessage, formatExpiryDatePt } = require('../../../renewal/renewalMessages');

console.log('\n🧪 TESTES — engine/renewal/renewalMessages\n');

const tests = [];

tests.push(test('renderRenewalMessage AVISO_3_DIAS substitui name, plan, data', () => {
  const text = renderRenewalMessage('AVISO_3_DIAS', {
    name: 'João',
    plan: 'Premium',
    expiry_date: '2026-03-31T23:59:59.000Z',
  });
  assert(text.includes('João'), 'name');
  assert(text.includes('Premium'), 'plan');
  assert(text.includes('StreamZone'), 'marca');
  assert(text.includes('3 dias'), '3 dias');
}));

tests.push(test('formatExpiryDatePt devolve texto legível', () => {
  const s = formatExpiryDatePt('2026-03-31T23:59:59.000Z');
  assert(s && s.length > 3, 'não vazio');
  assert(/\d/.test(s), 'contém dígito');
}));

Promise.all(tests).then(() => {
  console.log(`\n📊 renewalMessages: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
});
