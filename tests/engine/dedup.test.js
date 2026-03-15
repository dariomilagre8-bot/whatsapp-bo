// tests/engine/dedup.test.js
const { isDuplicate } = require('../../engine/lib/dedup');

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

console.log('\n📋 Dedup (idempotência):');

test('isDuplicate sem Redis retorna false (permite)', async () => {
  const dup = await isDuplicate(null, 'msg-123', 'streamzone');
  assert(dup === false, 'sem Redis deve permitir');
});

test('isDuplicate em memória: segunda chamada com mesmo id é duplicado', async () => {
  const id = 'test-' + Date.now() + '-' + Math.random();
  const first = await isDuplicate(null, id, 'streamzone');
  const second = await isDuplicate(null, id, 'streamzone');
  assert(first === false, 'primeira não é duplicado');
  assert(second === true, 'segunda é duplicado');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
