// tests/engine/metrics.test.js
const metrics = require('../../engine/lib/metrics');

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

console.log('\n📋 Metrics:');

test('increment aumenta contador', () => {
  metrics.increment('streamzone', 'messages_received');
  metrics.increment('streamzone', 'messages_received');
  const text = metrics.getPrometheusText();
  assert(text.includes('palanca_messages_received'), 'deve conter métrica');
  assert(text.includes('client="streamzone"'), 'deve conter client');
});

test('getPrometheusText retorna string', () => {
  const text = metrics.getPrometheusText();
  assert(typeof text === 'string', 'string');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
