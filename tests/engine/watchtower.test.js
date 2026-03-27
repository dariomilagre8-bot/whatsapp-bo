// tests/engine/watchtower.test.js — Testes unitários Watchtower (extract + analyze)
// Mock Supabase: sem chamadas reais. CommonJS.
'use strict';

const { analyze, classifySentiment, extractTopProducts } = require('../../services/watchtower/analyze');

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

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

// ── analyze.js ──────────────────────────────────────────────────────────────
console.log('\n📊 Watchtower: analyze.js');

test('classifySentiment: positivo detectado', () => {
  assertEqual(classifySentiment('Obrigado, funcionou muito bem!'), 'positive');
});

test('classifySentiment: negativo detectado', () => {
  assertEqual(classifySentiment('Isso não funciona, é um bug!'), 'negative');
});

test('classifySentiment: neutro por defeito', () => {
  assertEqual(classifySentiment('Quero saber o preço'), 'neutral');
});

test('classifySentiment: null → neutral', () => {
  assertEqual(classifySentiment(null), 'neutral');
});

test('extractTopProducts: conta tokens correctamente', () => {
  const rows = [
    { message_text: 'quero netflix premium', intent: 'INTENT_VENDA' },
    { message_text: 'netflix para dois', intent: 'INTENT_VENDA' },
    { message_text: 'spotify familiar', intent: 'INTENT_VENDA' },
  ];
  const top = extractTopProducts(rows);
  assert(Array.isArray(top), 'deve ser array');
  const netflix = top.find(p => p.product === 'netflix');
  assert(netflix && netflix.count >= 2, 'netflix deve aparecer pelo menos 2x');
});

test('extractTopProducts: max 5 produtos', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    message_text: `produto${i} exclusivo premium especial`,
    intent: 'INTENT_VENDA',
  }));
  const top = extractTopProducts(rows);
  assert(top.length <= 5, 'máximo 5 produtos');
});

test('analyze: estrutura completa', () => {
  const extracted = {
    client_slug: 'streamzone',
    date: '2026-03-26',
    messages_total: 50,
    messages_from_clients: 30,
    sales_completed: 5,
    sales_abandoned: 3,
    raw_intent_rows: [
      { message_text: 'quero netflix', intent: 'INTENT_VENDA' },
      { message_text: 'Obrigado funciona!', intent: 'INTENT_VENDA' },
      { message_text: 'não funciona isso', intent: 'INTENT_VENDA' },
    ],
  };
  const result = analyze(extracted);
  assert(result.client_slug === 'streamzone', 'client_slug');
  assert(result.date === '2026-03-26', 'date');
  assertEqual(result.messages_total, 50, 'messages_total');
  assertEqual(result.sales_completed, 5, 'sales_completed');
  assertEqual(result.sales_abandoned, 3, 'sales_abandoned');
  assert(typeof result.sentiment_positive === 'number', 'sentiment_positive');
  assert(typeof result.sentiment_negative === 'number', 'sentiment_negative');
  assert(Array.isArray(result.top_products), 'top_products array');
  assert(Array.isArray(result.loss_reasons), 'loss_reasons array');
});

test('analyze: sem intent_rows → sentimentos 0', () => {
  const extracted = {
    client_slug: 'luna',
    date: '2026-03-26',
    messages_total: 10,
    messages_from_clients: 5,
    sales_completed: 0,
    sales_abandoned: 0,
    raw_intent_rows: [],
  };
  const result = analyze(extracted);
  assertEqual(result.sentiment_positive, 0, 'positivos 0');
  assertEqual(result.sentiment_negative, 0, 'negativos 0');
  assertEqual(result.sentiment_neutral, 0, 'neutros 0');
});

// ── extract.js (mock Supabase) ──────────────────────────────────────────────
console.log('\n📦 Watchtower: extract.js (mock Supabase)');

const { extractForClient, yesterdayUtc } = require('../../services/watchtower/extract');

test('yesterdayUtc: formato YYYY-MM-DD', () => {
  const result = yesterdayUtc();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(result), `formato inválido: ${result}`);
});

test('extractForClient: retorna estrutura com zeros quando Supabase devolve 0', async () => {
  const mockSb = {
    from: () => ({
      select: () => ({
        eq:  function() { return this; },
        gte: function() { return this; },
        lte: function() { return this; },
        limit: function() { return this; },
        then: (r) => r({ count: 0, data: [], error: null }),
        // Promise-like
        count: 0, data: [], error: null,
      }),
    }),
  };
  // O mock precisa de retornar Promises correctamente
  const fakeSb = buildMockSb(0);
  const result = await extractForClient(fakeSb, 'streamzone', '2026-03-26');
  assert(result.client_slug === 'streamzone', 'client_slug');
  assert(result.date === '2026-03-26', 'date');
  assert(typeof result.messages_total === 'number', 'messages_total number');
  assert(Array.isArray(result.raw_intent_rows), 'raw_intent_rows array');
});

function buildMockSb(countValue) {
  const makeQuery = (isSelect = false) => {
    const q = {
      eq: function() { return this; },
      gte: function() { return this; },
      lte: function() { return this; },
      limit: function() { return this; },
      select: function(_, opts) {
        if (opts && opts.count === 'exact') {
          return Object.assign(Promise.resolve({ count: countValue, error: null }), q);
        }
        return Object.assign(Promise.resolve({ data: [], error: null }), q);
      },
    };
    return q;
  };
  return { from: () => makeQuery() };
}

// Correr o teste async
(async () => {
  try {
    const fakeSb = buildMockSb(5);
    const result = await extractForClient(fakeSb, 'luna', '2026-03-25');
    if (result.client_slug === 'luna' && result.date === '2026-03-25') {
      console.log('  ✅ extractForClient: async com mock Supabase');
      passed++;
    } else {
      console.log('  ❌ extractForClient: resultado inesperado');
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ extractForClient async: ${err.message}`);
    failed++;
  }

  console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
