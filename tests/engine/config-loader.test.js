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

console.log('\n📋 Config loader (clients/*):');

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

test('luna config carrega (ZapPrincipal)', () => {
  const config = require('../../clients/luna/config');
  assert(config.slug === 'luna', 'slug');
  assert(config.evolutionInstance === 'ZapPrincipal', 'evolutionInstance');
  assert(config.identity.botName === 'Luna', 'botName');
});

test('demo config carrega (demo-moda)', () => {
  const config = require('../../clients/demo/config');
  assert(config.slug === 'demo', 'slug');
  assert(config.evolutionInstance === 'demo-moda', 'evolutionInstance');
  assert(config.identity.botName === 'Bia', 'botName');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
