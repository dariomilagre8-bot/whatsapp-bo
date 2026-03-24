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

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

const { getProductDetails } = require('../../../engine/catalog/catalogLookup');
const sz = require('../../../clients/streamzone/config');

console.log('\n🧪 TESTES — engine/catalog/catalogLookup\n');

test('fuzzy match netflix individual → preço 5000', () => {
  const d = getProductDetails(sz, 'quero netflix individual');
  assert(d && d.price_kz === 5000, `preço ${d && d.price_kz}`);
  assert(d.name.includes('Netflix'), 'nome');
});

test('sem match → null', () => {
  assert(getProductDetails(sz, 'xyzabc123nada') === null, 'null');
});

console.log(`\n📊 Resultado: ${passed} passou | ${failed} falhou`);
if (failed) process.exit(1);
