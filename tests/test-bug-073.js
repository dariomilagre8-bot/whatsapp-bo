// tests/test-bug-073.js — Prompt variant persistido na sessão
// Só suporte_conta força critical_rules; primeira mensagem = default.

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

let INTENTS;
try {
  ({ INTENTS } = require('../src/engine/intentDetector'));
} catch (_) {
  INTENTS = {
    SAUDACAO: 'INTENT_SAUDACAO',
    VENDA: 'INTENT_VENDA',
    DESCONHECIDO: 'INTENT_DESCONHECIDO',
    SUPORTE_CONTA: 'INTENT_SUPORTE_CONTA',
  };
}

/** Espelha webhook.js (BUG-073 actualizado). */
function applyPromptVariantLogic(session, intent) {
  if (!session.promptVariant) {
    session.promptVariant = 'default';
  }
  if (intent === INTENTS.SUPORTE_CONTA) {
    session.promptVariant = 'critical_rules';
  }
  return session.promptVariant;
}

console.log('\n🧪 TESTES BUG-073 (Prompt variant persistido)\n');
console.log('📋 Persistência básica:');

async function runTests() {
  await test('Msg 1 saudação → default; Msg 2 venda → mantém default', () => {
    const session = {};
    const v1 = applyPromptVariantLogic(session, INTENTS.SAUDACAO);
    assert(v1 === 'default', `msg1: esperado default, got ${v1}`);
    const v2 = applyPromptVariantLogic(session, INTENTS.VENDA);
    assert(v2 === 'default', `msg2: esperado default (sessão), got ${v2}`);
  });

  await test('Msg 1 desconhecido → default; Msg 2 mantém default', () => {
    const session = {};
    const v1 = applyPromptVariantLogic(session, INTENTS.DESCONHECIDO);
    assert(v1 === 'default', `msg1: esperado default, got ${v1}`);
    const v2 = applyPromptVariantLogic(session, INTENTS.SAUDACAO);
    assert(v2 === 'default', `msg2: esperado default, got ${v2}`);
  });

  await test('Msg 1 saudação → default; Msg 2 desconhecido → mantém default', () => {
    const session = {};
    applyPromptVariantLogic(session, INTENTS.SAUDACAO);
    const v2 = applyPromptVariantLogic(session, INTENTS.DESCONHECIDO);
    assert(v2 === 'default', `msg2: deve manter default, got ${v2}`);
  });

  console.log('\n📋 Excepção de escalação (suporte_conta):');

  await test('suporte_conta força critical_rules mesmo com promptVariant=default', () => {
    const session = { promptVariant: 'default' };
    const v = applyPromptVariantLogic(session, INTENTS.SUPORTE_CONTA);
    assert(v === 'critical_rules', `esperado critical_rules, got ${v}`);
    assert(session.promptVariant === 'critical_rules', 'sessão deve ser actualizada');
  });

  await test('suporte_conta idempotente se já é critical_rules', () => {
    const session = { promptVariant: 'critical_rules' };
    const v = applyPromptVariantLogic(session, INTENTS.SUPORTE_CONTA);
    assert(v === 'critical_rules', `esperado critical_rules, got ${v}`);
  });

  await test('fluxo completo: saudação → preço → suporte_conta → critical', () => {
    const session = {};
    applyPromptVariantLogic(session, INTENTS.SAUDACAO);
    applyPromptVariantLogic(session, INTENTS.VENDA);
    const v3 = applyPromptVariantLogic(session, INTENTS.SUPORTE_CONTA);
    assert(v3 === 'critical_rules', `msg3: esperado critical_rules, got ${v3}`);
  });

  await test('sessão nova com intent saudação → promptVariant = default', () => {
    const session = {};
    const v = applyPromptVariantLogic(session, INTENTS.SAUDACAO);
    assert(v === 'default', `esperado default, got ${v}`);
    assert(session.promptVariant === 'default', 'deve persistir na sessão');
  });

  console.log(`\n📊 BUG-073: ${passed} passou | ${failed} falhou`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('❌ Erro fatal BUG-073:', err.message);
  process.exit(1);
});
