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

const {
  buildProductIndex,
  formatCatalogIndexForPrompt,
  estimateCatalogIndexTokens,
} = require('../../../engine/catalog/catalogIndex');

const mockCfg = {
  products: {
    Netflix: {
      plans: {
        Individual: { price: 5000 },
        Partilhado: { price: 9000 },
      },
    },
  },
};

console.log('\n🧪 TESTES — engine/catalog/catalogIndex\n');

test('buildProductIndex gera ids e preços', () => {
  const idx = buildProductIndex(mockCfg);
  assert(idx.some((p) => p.product_id === 'netflix_individual' && p.price_kz === 5000), 'netflix individual');
});

test('formatCatalogIndexForPrompt e tokens < 500', () => {
  const s = formatCatalogIndexForPrompt(mockCfg);
  assert(s.startsWith('Produtos disponíveis:'), 'prefixo');
  assert(s.includes('Netflix Individual'), 'nome');
  assert(estimateCatalogIndexTokens(mockCfg) < 500, 'limite tokens');
});

console.log(`\n📊 Resultado: ${passed} passou | ${failed} falhou`);
if (failed) process.exit(1);
