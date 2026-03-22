'use strict';

const { resolveEvolutionInstance, sendText } = require('../../engine/lib/sender');

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

console.log('\n🧪 TESTES — engine/lib/sender (instância Evolution)\n');

test('resolveEvolutionInstance: prioriza clientConfig.evolutionInstance sobre evolutionConfig.instance', () => {
  const r = resolveEvolutionInstance(
    { instance: 'InstanciaErrada' },
    { evolutionInstance: 'ZapPrincipal' }
  );
  assert(r === 'ZapPrincipal', `esperado ZapPrincipal, got ${r}`);
});

test('resolveEvolutionInstance: usa evolutionConfig.instance sem clientConfig', () => {
  const r = resolveEvolutionInstance({ instance: 'demo-moda' }, null);
  assert(r === 'demo-moda', `got ${r}`);
});

test('resolveEvolutionInstance: fallback .env quando sem instance no config', () => {
  const prev = process.env.EVOLUTION_INSTANCE;
  process.env.EVOLUTION_INSTANCE = 'EnvFallbackInst';
  try {
    const r = resolveEvolutionInstance({}, {});
    assert(r === 'EnvFallbackInst', `got ${r}`);
  } finally {
    if (prev === undefined) delete process.env.EVOLUTION_INSTANCE;
    else process.env.EVOLUTION_INSTANCE = prev;
  }
});

test('sendText: URL usa instância do clientConfig quando evolutionConfig.instance está errado', async () => {
  const prevFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = async (url) => {
    requestedUrl = url;
    return { ok: true, text: async () => '' };
  };
  try {
    await sendText(
      '244900000000',
      'oi',
      { apiUrl: 'http://evo.test', apiKey: 'k', instance: 'GLOBAL_ERRADO' },
      { evolutionInstance: 'Streamzone Braulio' }
    );
    assert(
      requestedUrl.includes('/message/sendText/Streamzone Braulio'),
      `URL inesperada: ${requestedUrl}`
    );
  } finally {
    global.fetch = prevFetch;
  }
});

console.log(`\n📊 Sender: ${passed} ok, ${failed} falharam\n`);
if (failed > 0) process.exit(1);
