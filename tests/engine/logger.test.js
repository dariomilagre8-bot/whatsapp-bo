// tests/engine/logger.test.js
const { createLogger, log } = require('../../engine/lib/logger');

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

console.log('\n📋 Logger (trace_id, createLogger):');

test('createLogger retorna object com info, warn, error, debug', () => {
  const logger = createLogger('trace-1', 'streamzone', 'test');
  assert(typeof logger.info === 'function', 'info');
  assert(typeof logger.warn === 'function', 'warn');
  assert(typeof logger.error === 'function', 'error');
  assert(typeof logger.debug === 'function', 'debug');
});

test('log existe e é função', () => {
  assert(typeof log === 'function', 'log');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
