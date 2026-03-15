// tests/engine/config-loader.test.js
const path = require('path');

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

console.log('\n📋 Config loader (clients/streamzone):');

test('streamzone config carrega com slug e evolutionInstance', () => {
  const config = require('../../clients/streamzone/config');
  assert(config.slug === 'streamzone', 'slug');
  assert(config.evolutionInstance != null, 'evolutionInstance');
});

test('streamzone config tem fixedResponses e states', () => {
  const config = require('../../clients/streamzone/config');
  assert(Array.isArray(config.fixedResponses), 'fixedResponses');
  assert(config.states && config.states.initial, 'states.initial');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
