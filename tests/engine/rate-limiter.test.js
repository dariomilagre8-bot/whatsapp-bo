// tests/engine/rate-limiter.test.js
const { RateLimiter } = require('../../engine/lib/rate-limiter');

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

console.log('\n📋 RateLimiter:');

test('permite até maxRequests', () => {
  const rl = new RateLimiter({ maxRequests: 3, windowMs: 30000 });
  assert(rl.isAllowed('123') === true, '1');
  assert(rl.isAllowed('123') === true, '2');
  assert(rl.isAllowed('123') === true, '3');
  assert(rl.isAllowed('123') === false, '4 deve bloquear');
});

test('números diferentes são independentes', () => {
  const rl = new RateLimiter({ maxRequests: 1, windowMs: 30000 });
  assert(rl.isAllowed('111') === true, '111 primeiro');
  assert(rl.isAllowed('222') === true, '222 primeiro');
  assert(rl.isAllowed('111') === false, '111 segundo');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
