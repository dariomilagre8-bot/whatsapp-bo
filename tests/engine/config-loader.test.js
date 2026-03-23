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

function uncache(rel) {
  try {
    delete require.cache[require.resolve(rel)];
  } catch (_) {
    /* ok */
  }
}

test('load-client: sem env usa streamzone', () => {
  delete process.env.ACTIVE_CLIENT;
  delete process.env.CLIENT_SLUG;
  uncache('../../config/load-client.js');
  uncache('../../clients/streamzone/config.js');
  const loadClientConfig = require('../../config/load-client');
  const cfg = loadClientConfig();
  assert(cfg.slug === 'streamzone' || cfg.clientSlug === 'streamzone', 'default streamzone');
});

test('load-client: ACTIVE_CLIENT=demo', () => {
  process.env.ACTIVE_CLIENT = 'demo';
  delete process.env.CLIENT_SLUG;
  uncache('../../config/load-client.js');
  uncache('../../clients/demo/config.js');
  const loadClientConfig = require('../../config/load-client');
  const cfg = loadClientConfig();
  assert(cfg.clientSlug === 'demo' || cfg.slug === 'demo', 'slug demo');
});

test('load-client: ACTIVE_CLIENT=streamzone', () => {
  process.env.ACTIVE_CLIENT = 'streamzone';
  delete process.env.CLIENT_SLUG;
  uncache('../../config/load-client.js');
  uncache('../../clients/streamzone/config.js');
  const loadClientConfig = require('../../config/load-client');
  const cfg = loadClientConfig();
  assert(cfg.slug === 'streamzone', 'streamzone');
});

test('load-client: cliente inexistente lança [CONFIG]', () => {
  process.env.ACTIVE_CLIENT = 'inexistente_slug_xyz';
  delete process.env.CLIENT_SLUG;
  uncache('../../config/load-client.js');
  const loadClientConfig = require('../../config/load-client');
  let threw = false;
  let msg = '';
  try {
    loadClientConfig();
  } catch (e) {
    threw = true;
    msg = e.message || '';
  }
  assert(threw, 'deve lançar');
  assert(/\[CONFIG\]/.test(msg), 'prefixo CONFIG');
  assert(/dispon[ií]veis/i.test(msg), 'lista clientes');
});

test('load-client: sem fallback para outro cliente (inexistente não devolve streamzone)', () => {
  process.env.ACTIVE_CLIENT = 'inexistente_slug_xyz';
  uncache('../../config/load-client.js');
  const loadClientConfig = require('../../config/load-client');
  try {
    loadClientConfig();
    assert(false, 'não devia chegar aqui');
  } catch (e) {
    assert(!/Carregado:\s*clients\/streamzone/.test(e.message), 'erro não deve fingir streamzone');
  }
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
