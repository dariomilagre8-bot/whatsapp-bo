'use strict';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

const { routeToModel } = require('../../../engine/llm/router');
const { INTENTS } = require('../../../src/engine/intentDetector');

console.log('\n🧪 TESTES — engine/llm/router (routeToModel)\n');

test('SAUDACAO → gemini-flash / simple', () => {
  const r = routeToModel(INTENTS.SAUDACAO, {});
  assert(r.model === 'gemini-flash' && r.reason === 'simple');
});

test('VENDA sem multi-turn → simple', () => {
  const r = routeToModel(INTENTS.VENDA, { historyLen: 0, pendingSale: false });
  assert(r.model === 'gemini-flash' && r.reason === 'simple');
});

test('VENDA com histórico → medium / claude', () => {
  const r = routeToModel(INTENTS.VENDA, { historyLen: 3, pendingSale: false });
  assert(r.model === 'claude-sonnet-4' && r.reason === 'medium');
});

test('VENDA com pendingSale → medium', () => {
  const r = routeToModel(INTENTS.VENDA, { historyLen: 0, pendingSale: true });
  assert(r.model === 'claude-sonnet-4' && r.reason === 'medium');
});

test('SUPORTE_CONTA → complex / claude', () => {
  const r = routeToModel(INTENTS.SUPORTE_CONTA, { confidence: 0.95 });
  assert(r.model === 'claude-sonnet-4' && r.reason === 'complex');
});

test('confidence < 0.7 → complex', () => {
  const r = routeToModel(INTENTS.SAUDACAO, { confidence: 0.5 });
  assert(r.model === 'claude-sonnet-4' && r.reason === 'complex');
});

test('DESCONHECIDO → simple (FORA_CONTEXTO)', () => {
  const r = routeToModel(INTENTS.DESCONHECIDO, { confidence: 0.9 });
  assert(r.model === 'gemini-flash' && r.reason === 'simple');
});

console.log(`\n📊 router: ${passed} ok, ${failed} falharam\n`);
if (failed) process.exit(1);
