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

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

let mockRows = [];

function freshNegativeRules() {
  const supPath = require.resolve('../../../engine/lib/supabase');
  require.cache[supPath] = {
    id: supPath,
    filename: supPath,
    loaded: true,
    exports: {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: mockRows, error: null }),
        }),
        insert: (row) => {
          const r = Array.isArray(row) ? row[0] : row;
          mockRows.push({
            ...r,
            id: 'new-uuid',
            active: true,
            created_at: new Date().toISOString(),
          });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'new-uuid' }, error: null }),
            }),
          };
        },
      }),
    },
  };
  delete require.cache[require.resolve('../../../engine/learning/negativeRules')];
  return require('../../../engine/learning/negativeRules');
}

console.log('\n🧪 TESTES — engine/learning/negativeRules\n');

const tests = [];

tests.push(
  test('loadNegativeRules + matchNegativeRule (global)', async () => {
    mockRows = [
      {
        id: 'a1',
        client_id: null,
        input_pattern: 'pacote disney',
        wrong_intent: 'VENDA',
        correct_intent: 'INTENT_DESCONHECIDO',
        active: true,
        created_at: '2026-03-01T00:00:00Z',
      },
    ];
    const nr = freshNegativeRules();
    await nr.loadNegativeRules();
    const m = nr.matchNegativeRule('Olá, têm pacote disney?', 'streamzone');
    assert(m && m.id === 'a1', 'match global');
  })
);

tests.push(
  test('matchNegativeRule respeita client_id', async () => {
    mockRows = [
      {
        id: 'b1',
        client_id: 'demo',
        input_pattern: 'foo',
        wrong_intent: 'X',
        correct_intent: 'INTENT_VENDA',
        active: true,
        created_at: '2026-03-02T00:00:00Z',
      },
    ];
    const nr = freshNegativeRules();
    await nr.loadNegativeRules();
    assert(nr.matchNegativeRule('foo bar', 'streamzone') === null, 'não deve casar outro cliente');
    assert(nr.matchNegativeRule('foo bar', 'demo') !== null, 'deve casar demo');
  })
);

tests.push(
  test('addNegativeRule chama insert e refresca cache', async () => {
    mockRows = [];
    const nr = freshNegativeRules();
    await nr.addNegativeRule('streamzone', {
      input_pattern: 'x',
      wrong_intent: 'A',
      correct_intent: 'INTENT_VENDA',
      bug_id: '051',
    });
    assert(nr.matchNegativeRule('prefix x suffix', 'streamzone') !== null, 'cache actualizado');
  })
);

tests.push(
  test('cache refresh simulado (_testSetCache)', async () => {
    const nr = freshNegativeRules();
    await nr.loadNegativeRules();
    nr._testSetCache([
      {
        id: 'c1',
        client_id: null,
        input_pattern: 'old',
        wrong_intent: 'w',
        correct_intent: 'INTENT_SAUDACAO',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
    assert(nr.matchNegativeRule('old text', null) !== null, 'primeira versão');
    nr._testSetCache([]);
    assert(nr.matchNegativeRule('old text', null) === null, 'após refresh vazio');
  })
);

(async () => {
  for (const t of tests) await t();
  console.log(`\n📊 Resultado: ${passed} passou | ${failed} falhou`);
  if (failed) process.exit(1);
})();
