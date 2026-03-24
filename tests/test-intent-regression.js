// tests/test-intent-regression.js — regressão: casos reais que falharam em produção

const { detectIntent, INTENTS } = require('../src/engine/intentDetector');

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

const SZ = 'streamzone';

const REGRESSION_CASES = [
  { input: 'Tem plano de 3 ecrãs?', mustNot: INTENTS.SUPORTE_CONTA, source: 'BUG-074' },
  { input: '3 pessoas', mustNot: INTENTS.SUPORTE_CONTA, source: 'BUG-074' },
  {
    input: 'Quero assistir hanna Montana no prime tem?',
    mustNot: INTENTS.SUPORTE_CONTA,
    source: 'Hilda Campos',
  },
  { input: 'Têm pacotes do Disney plus?', mustNot: INTENTS.SUPORTE_CONTA, source: 'Hilda Campos' },
];

console.log('\n📋 Intent regression (produção)\n');

for (const { input, mustNot, source } of REGRESSION_CASES) {
  test(`${source}: ${JSON.stringify(input)}`, () => {
    const { intent } = detectIntent({ text: input, clientSlug: SZ });
    assert(
      intent !== mustNot,
      `não deve ser ${mustNot} (obtido ${intent})`
    );
  });
}

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
