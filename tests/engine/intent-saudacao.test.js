// tests/engine/intent-saudacao.test.js — BUG-067: saudações com acentos PT
// Verifica que \b Unicode-aware (normalizePattern) detecta "Olá", "olá!", etc.

const { detectIntent, INTENTS } = require('../../src/engine/intentDetector');

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

console.log('\n📋 Intent saudação + BUG-067 (acentos):');

// ─── Saudações com acentos (BUG-067) ─────────────────────────────────────────

test('"Olá" → INTENT_SAUDACAO (BUG-067)', () => {
  const { intent } = detectIntent({ text: 'Olá' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

test('"olá" (minúscula) → INTENT_SAUDACAO', () => {
  const { intent } = detectIntent({ text: 'olá' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

test('"Olá!" (com !) → INTENT_SAUDACAO', () => {
  const { intent } = detectIntent({ text: 'Olá!' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

test('"Ola" (sem acento) → INTENT_SAUDACAO', () => {
  const { intent } = detectIntent({ text: 'Ola' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

test('"Oi" → INTENT_SAUDACAO', () => {
  const { intent } = detectIntent({ text: 'Oi' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

test('"bom dia" → INTENT_SAUDACAO', () => {
  const { intent } = detectIntent({ text: 'bom dia' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

test('"boa tarde" → INTENT_SAUDACAO', () => {
  const { intent } = detectIntent({ text: 'boa tarde' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

test('"boa noite" → INTENT_SAUDACAO', () => {
  const { intent } = detectIntent({ text: 'boa noite' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

test('"Boa tarde prezados" → INTENT_SAUDACAO (complemento educado)', () => {
  const { intent } = detectIntent({ text: 'Boa tarde prezados' });
  assert(intent === INTENTS.SAUDACAO, `intent=${intent}`);
});

// ─── Negativas (não deve detectar SAUDACAO) ──────────────────────────────────

test('"Olátimo" → NÃO é SAUDACAO (false positive)', () => {
  const { intent } = detectIntent({ text: 'Olátimo' });
  assert(intent !== INTENTS.SAUDACAO, `não devia ser SAUDACAO: intent=${intent}`);
});

test('"bom diazinho" → NÃO é SAUDACAO', () => {
  const { intent } = detectIntent({ text: 'bom diazinho' });
  assert(intent !== INTENTS.SAUDACAO, `não devia ser SAUDACAO: intent=${intent}`);
});

// ─── Acentos noutras intents ──────────────────────────────────────────────────

test('"Já paguei" (streamzone) → INTENT_SUPORTE_CONTA', () => {
  const { intent } = detectIntent({ text: 'Já paguei', clientSlug: 'streamzone' });
  assert(intent === INTENTS.SUPORTE_CONTA, `intent=${intent}`);
});

test('"Não funciona" (streamzone) → INTENT_SUPORTE_CONTA', () => {
  const { intent } = detectIntent({ text: 'Não funciona', clientSlug: 'streamzone' });
  assert(intent === INTENTS.SUPORTE_CONTA, `intent=${intent}`);
});

test('"Não funciona" (demo) → INTENT_SUPORTE_ERRO', () => {
  const { intent } = detectIntent({ text: 'Não funciona', clientSlug: 'demo' });
  assert(intent === INTENTS.SUPORTE_ERRO, `intent=${intent}`);
});

test('"Já paguei mas não activaram" (streamzone) → INTENT_SUPORTE_CONTA', () => {
  const { intent } = detectIntent({ text: 'Já paguei mas não activaram', clientSlug: 'streamzone' });
  assert(intent === INTENTS.SUPORTE_CONTA, `intent=${intent}`);
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
