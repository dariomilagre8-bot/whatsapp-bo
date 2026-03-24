// tests/test-bug-072.js — Normalização de número de telefone robusta
// BUG-072: extractPhoneNumber deve suportar LIDs angolanos (0XXXXXXXXX), Portugal (351), etc.

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => { console.log(`  ✅ ${name}`); passed++; },
        (err) => { console.log(`  ❌ ${name}: ${err.message}`); failed++; }
      );
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

const { extractPhoneNumber } = require('../src/utils/phone');

console.log('\n🧪 TESTES BUG-072 (Normalização de telefone)\n');
console.log('📋 Casos Angola:');

async function runTests() {
  // Angola — já normalizado
  await test('"244941713216" → "244941713216" (já normalizado)', () => {
    assert(extractPhoneNumber('244941713216') === '244941713216');
  });

  await test('"244941713216@s.whatsapp.net" → "244941713216"', () => {
    assert(extractPhoneNumber('244941713216@s.whatsapp.net') === '244941713216');
  });

  // Angola — 9 dígitos sem prefixo
  await test('"941713216" (9 díg, começa 9) → "244941713216"', () => {
    assert(extractPhoneNumber('941713216') === '244941713216', `got: ${extractPhoneNumber('941713216')}`);
  });

  // LID / identificador interno 08… — não assumir prefixo Angola (BUG-072 + LID)
  await test('"0808441748" (10 díg, 08…) → mantém dígitos (não 244)', () => {
    const result = extractPhoneNumber('0808441748');
    assert(result === '0808441748', `esperado 0808441748, got: ${result}`);
  });

  await test('"0941713216" (10 díg, começa 0) → "244941713216"', () => {
    const result = extractPhoneNumber('0941713216');
    assert(result === '244941713216', `esperado 244941713216, got: ${result}`);
  });

  console.log('\n📋 Casos Portugal:');

  await test('"351934937617" (12 díg, começa 351) → "351934937617"', () => {
    const result = extractPhoneNumber('351934937617');
    assert(result === '351934937617', `esperado 351934937617, got: ${result}`);
  });

  await test('"351934937617@s.whatsapp.net" → "351934937617"', () => {
    const result = extractPhoneNumber('351934937617@s.whatsapp.net');
    assert(result === '351934937617', `esperado 351934937617, got: ${result}`);
  });

  console.log('\n📋 JIDs com 244 embutido:');

  await test('"251244941713216" longo → extrai "244941713216"', () => {
    const result = extractPhoneNumber('251244941713216@lid');
    assert(result === '244941713216', `esperado 244941713216, got: ${result}`);
  });

  console.log('\n📋 Casos inválidos:');

  await test('"" (vazio) → ""', () => {
    assert(extractPhoneNumber('') === '');
  });

  await test('null → ""', () => {
    assert(extractPhoneNumber(null) === '');
  });

  await test('"abc" (sem dígitos) → ""', () => {
    assert(extractPhoneNumber('abc') === '');
  });

  await test('"12345" (muito curto) → ""', () => {
    assert(extractPhoneNumber('12345') === '');
  });

  console.log(`\n📊 BUG-072: ${passed} passou | ${failed} falhou`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('❌ Erro fatal BUG-072:', err.message);
  process.exit(1);
});
