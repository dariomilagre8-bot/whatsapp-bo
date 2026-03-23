// tests/engine/intent-suporte-conta.test.js — INTENT_SUPORTE_CONTA (StreamZone, pré-LLM)

const { detectIntent, INTENTS } = require('../../src/engine/intentDetector');

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

console.log('\n📋 Intent suporte_conta (StreamZone):');

test('detecta suporte_conta para "meu plano não está funcionando" (streamzone)', () => {
  const { intent } = detectIntent({ text: 'meu plano não está funcionando', clientSlug: 'streamzone' });
  assert(intent === INTENTS.SUPORTE_CONTA, 'intent');
});

test('não dispara suporte_conta para cliente demo', () => {
  const { intent } = detectIntent({ text: 'meu plano não funciona', clientSlug: 'demo' });
  assert(intent !== INTENTS.SUPORTE_CONTA, 'demo não usa esta intent');
});

test('streamzone config inclui accountSupport', () => {
  const cfg = require('../../clients/streamzone/config');
  assert(cfg.accountSupport && cfg.accountSupport.response, 'accountSupport.response');
  assert(cfg.accountSupport.supervisorMessage, 'supervisorMessage');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
