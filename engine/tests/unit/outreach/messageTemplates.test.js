// engine/tests/unit/outreach/messageTemplates.test.js

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

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

const {
  NICHOS,
  NICHE_KEYS,
  renderMessage,
  getRawTemplate,
  normalizeVariant,
} = require('../../../outreach/messageTemplates');

console.log('\n🧪 messageTemplates\n');

test('quatro nichos com A/B/C', () => {
  assert(NICHE_KEYS.length === 4, 'nichos');
  for (const k of NICHE_KEYS) {
    assert(NICHOS[k].A && NICHOS[k].B && NICHOS[k].C, k);
  }
});

test('ecommerce A contém Palanca e nome_empresa placeholder', () => {
  const t = NICHOS.ecommerce.A;
  assert(t.includes('Palanca Automações'), 'marca');
  assert(t.includes('{nome_empresa}'), 'placeholder empresa');
});

test('renderMessage ecommerce A substitui variáveis', () => {
  const m = renderMessage('ecommerce', 'A', { nome_pessoa: 'João', nome_empresa: 'Crocs' });
  assert(m.includes('João'), 'pessoa');
  assert(m.includes('Crocs'), 'empresa');
  assert(!m.includes('{nome_pessoa}'), 'sem placeholder pessoa');
});

test('generico usa servico_principal', () => {
  const m = renderMessage('generico', 'B', {
    nome_pessoa: 'Ana',
    nome_empresa: 'Loja X',
    servico_principal: 'relógios',
  });
  assert(m.includes('relógios'), 'serviço');
});

test('normalizeVariant aceita minúsculas', () => {
  assert(normalizeVariant('b') === 'B');
});

test('getRawTemplate rejeita nicho inválido', () => {
  let ok = false;
  try {
    getRawTemplate('foo', 'A');
  } catch (_) {
    ok = true;
  }
  assert(ok);
});

if (failed) process.exit(1);
console.log(`\n${passed} ok\n`);
