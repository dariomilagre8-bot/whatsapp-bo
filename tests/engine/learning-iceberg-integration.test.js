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

console.log('\n🧪 TESTES — integração negative rules + iceberg\n');

test('intent: negative rule bypassa resto do detector', () => {
  const neg = require('../../engine/learning/negativeRules');
  neg._testSetCache([
    {
      id: 'rule-int',
      client_id: null,
      input_pattern: 'frase unica bug74',
      wrong_intent: 'SUPORTE',
      correct_intent: 'INTENT_VENDA',
      active: true,
      created_at: '2026-03-24T00:00:00Z',
    },
  ]);
  delete require.cache[require.resolve('../../src/engine/intentDetector')];
  const { detectIntent, INTENTS } = require('../../src/engine/intentDetector');
  const r = detectIntent({ text: 'Cliente diz: frase unica bug74 sobre planos', clientSlug: 'streamzone' });
  assert(r.source === 'negative_rule', 'source');
  assert(r.intent === INTENTS.VENDA, `intent ${r.intent}`);
  assert(r.ruleId === 'rule-int', 'ruleId');
  neg._testSetCache([]);
});

test('buildDynamicPrompt usa índice iceberg com products', () => {
  const llm = require('../../engine/lib/llm');
  const cfg = require('../../clients/streamzone/config');
  const prompt = llm.buildDynamicPrompt('', 'Ana', true, { counts: null, erro: null }, {}, null, cfg);
  assert(prompt.includes('Produtos disponíveis:'), 'índice');
  assert(prompt.includes('Netflix Individual'), 'produto');
  assert(prompt.includes('índice leve'), 'rótulo iceberg');
});

test('prepareLlmUserMessage injecta JSON do produto (VENDA)', () => {
  const { prepareLlmUserMessage } = require('../../engine/orchestrator');
  const { INTENTS } = require('../../src/engine/intentDetector');
  const cfg = require('../../clients/streamzone/config');
  const { userMessage } = prepareLlmUserMessage(INTENTS.VENDA, 'preço netflix individual', cfg);
  assert(userMessage.includes('Contexto do produto pedido'), 'contexto');
  assert(userMessage.includes('"price_kz":5000'), 'preço no JSON');
});

console.log(`\n📊 Resultado: ${passed} passou | ${failed} falhou`);
if (failed) process.exit(1);
