// tests/qa-runner.test.js — QA runner: carregamento de cenários, scoring, exit code
// CommonJS | Node.js 20

const { loadScenario, checkResponse, calculateScore } = require('../engine/lib/qa-runner');

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

console.log('\n📋 QA Runner — cenários e scoring:');

// ─── Carregamento de cenários ────────────────────────────────────────────────

test('streamzone → cenário streaming', () => {
  const { nicho, scenarios } = loadScenario({ slug: 'streamzone' });
  assert(nicho === 'streaming', `nicho=${nicho}`);
  assert(Array.isArray(scenarios) && scenarios.length > 0, 'cenários vazios');
});

test('demo → cenário ecommerce', () => {
  const { nicho, scenarios } = loadScenario({ slug: 'demo' });
  assert(nicho === 'ecommerce', `nicho=${nicho}`);
  assert(scenarios.length > 0, 'cenários vazios');
});

test('slug desconhecido → fallback generico', () => {
  const { nicho, scenarios } = loadScenario({ slug: 'slug_xyz_inexistente' });
  assert(nicho === 'generico', `nicho=${nicho}`);
  assert(scenarios.length > 0, 'cenários vazios');
});

test('niche explícito no config sobrepõe slug', () => {
  const { nicho } = loadScenario({ slug: 'qualquer', niche: 'suporte' });
  assert(nicho === 'suporte', `nicho=${nicho}`);
});

test('todos os 5 ficheiros JSON existem e têm msg+expectedIntent', () => {
  const nomes = ['streaming', 'ecommerce', 'alucinacao', 'suporte', 'generico'];
  for (const nome of nomes) {
    const items = require(`../engine/templates/qa-scenarios/${nome}.json`);
    assert(Array.isArray(items) && items.length > 0, `${nome}.json vazio`);
    for (const item of items) {
      assert(typeof item.msg === 'string' && item.msg, `${nome}.json: item sem msg`);
      assert(typeof item.expectedIntent === 'string', `${nome}.json: item sem expectedIntent`);
    }
  }
});

// ─── Cálculo de score ────────────────────────────────────────────────────────

test('todos os checks passam → score 100', () => {
  const ok = { timeout: true, safe: true, intent: true, emoji: true, valid: true };
  assert(calculateScore([{ checks: ok }, { checks: ok }]) === 100, 'score ≠ 100');
});

test('todos os checks falham → score 0', () => {
  const bad = { timeout: false, safe: false, intent: false, emoji: false, valid: false };
  assert(calculateScore([{ checks: bad }]) === 0, 'score ≠ 0');
});

test('2/5 checks passam → score 40 (< 80 → bloqueia deploy)', () => {
  const mixed = { timeout: true, safe: true, intent: false, emoji: false, valid: false };
  const score = calculateScore([{ checks: mixed }]);
  assert(score === 40, `score=${score}`);
  assert(score < 80, 'devia ser < 80');
});

test('lista vazia → score 0', () => {
  assert(calculateScore([]) === 0, 'score ≠ 0');
});

// ─── Checks individuais ──────────────────────────────────────────────────────

test('resposta vazia falha valid', () => {
  const cfg = { slug: 'streamzone' };
  const c = checkResponse('Olá', '', 'saudacao', cfg, 100);
  assert(!c.valid, 'valid deve ser false');
});

test('link externo falha safe', () => {
  const cfg = { slug: 'streamzone' };
  const c = checkResponse('Olá', 'Veja https://malicious.com/promo', 'saudacao', cfg, 100);
  assert(!c.safe, 'safe deve ser false');
  assert(c.safeDetail === 'link_externo', `safeDetail=${c.safeDetail}`);
});

test('elapsed > 10s falha timeout', () => {
  const cfg = { slug: 'streamzone' };
  const c = checkResponse('Olá', 'Resposta normal', 'saudacao', cfg, 15000);
  assert(!c.timeout, 'timeout deve ser false');
});

test('"Olá" detectado como saudacao (BUG-067 fix)', () => {
  // BUG-067: normalizePattern corrige \b para chars acentuados PT
  const cfg = { slug: 'streamzone' };
  const c = checkResponse('Olá', 'Resposta', 'saudacao', cfg, 500);
  assert(c.intent, `intent falhou: detectedIntent=${c.detectedIntent}`);
});

test('noEmoji: resposta com emoji falha emoji check', () => {
  const cfg = { slug: 'streamzone', noEmoji: true };
  const c = checkResponse('Olá', 'Olá! 😊 Bem-vindo!', 'saudacao', cfg, 500);
  assert(!c.emoji, 'emoji check devia falhar');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
