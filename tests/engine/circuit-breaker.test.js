// tests/engine/circuit-breaker.test.js
const { CircuitBreaker } = require('../../engine/lib/circuit-breaker');

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

console.log('\n📋 CircuitBreaker:');

test('inicia fechado', () => {
  const cb = new CircuitBreaker('test');
  assert(cb.getState().state === 'closed', 'state');
  assert(cb.canExecute() === true, 'canExecute');
});

test('abre após maxFailures', () => {
  const cb = new CircuitBreaker('test', { maxFailures: 2 });
  cb.recordFailure();
  assert(cb.canExecute() === true, 'ainda pode após 1 falha');
  cb.recordFailure();
  assert(cb.getState().state === 'open', 'deve estar open');
  assert(cb.canExecute() === false, 'não pode executar');
});

test('reset após sucesso', () => {
  const cb = new CircuitBreaker('test', { maxFailures: 2 });
  cb.recordFailure();
  cb.recordSuccess();
  assert(cb.getState().state === 'closed', 'closed');
  assert(cb.getState().failures === 0, 'failures zero');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
