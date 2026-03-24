// engine/tests/unit/outreach/followUpSequence.test.js

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

const { getFollowUp, DAY2, DAY7 } = require('../../../outreach/followUpSequence');

console.log('\n🧪 followUpSequence\n');

test('dia 0–1: wait', () => {
  assert(getFollowUp('x', 0).phase === 'wait');
  assert(getFollowUp('x', 1).phase === 'wait');
});

test('dia 2: followup_1 com texto dia 2', () => {
  const r = getFollowUp('lead-1', 2, { nome_pessoa: 'João', nome_empresa: 'Crocs' });
  assert(r.phase === 'followup_1', r.phase);
  assert(r.message && r.message.includes('há 2 dias'), 'copy');
  assert(r.message.includes('João'), 'nome');
});

test('dia 7: followup_2 (última tentativa)', () => {
  const r = getFollowUp(null, 7, { nome_pessoa: 'Ana', nome_empresa: 'BabyCity' });
  assert(r.phase === 'followup_2');
  assert(r.message.includes('última mensagem'), 'copy');
});

test('dia 8+: dead', () => {
  const r = getFollowUp('id', 8);
  assert(r.phase === 'dead');
  assert(r.suggestedStatus === 'dead');
  assert(r.message == null);
});

test('constantes DAY2/DAY7 têm placeholders', () => {
  assert(DAY2.includes('{nome_pessoa}'));
  assert(DAY7.includes('{nome_pessoa}'));
});

if (failed) process.exit(1);
console.log(`\n${passed} ok\n`);
