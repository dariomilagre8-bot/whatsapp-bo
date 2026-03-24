// tests/test-bug-073.js — Prompt variant persistido na sessão
// BUG-073: promptVariant não deve mudar entre mensagens da mesma sessão
// EXCEPÇÃO: suporte_conta força critical_rules (escalação prioritária)

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

// Importar INTENTS do intentDetector para usar os mesmos valores
let INTENTS;
try {
  ({ INTENTS } = require('../src/engine/intentDetector'));
} catch (_) {
  INTENTS = {
    SAUDACAO: 'saudacao',
    VENDA: 'venda',
    DESCONHECIDO: 'desconhecido',
    SUPORTE_CONTA: 'suporte_conta',
  };
}

/**
 * Simula a lógica de definição de promptVariant do webhook.
 * Aplica as regras do BUG-073 fix.
 */
function applyPromptVariantLogic(session, intent) {
  if (intent === INTENTS.SUPORTE_CONTA && session.promptVariant !== 'critical_rules') {
    session.promptVariant = 'critical_rules';
  } else if (!session.promptVariant) {
    session.promptVariant = (intent === INTENTS.DESCONHECIDO) ? 'critical_rules' : 'default';
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

  await test('Msg 1 desconhecido → critical_rules; Msg 2 saudação → mantém critical_rules', () => {
    const session = {};
    const v1 = applyPromptVariantLogic(session, INTENTS.DESCONHECIDO);
    assert(v1 === 'critical_rules', `msg1: esperado critical_rules, got ${v1}`);
    const v2 = applyPromptVariantLogic(session, INTENTS.SAUDACAO);
    assert(v2 === 'critical_rules', `msg2: deve manter critical_rules da sessão, got ${v2}`);
  });

  await test('Msg 1 saudação → default; Msg 2 desconhecido → mantém default (não muda para critical)', () => {
    const session = {};
    applyPromptVariantLogic(session, INTENTS.SAUDACAO);
    const v2 = applyPromptVariantLogic(session, INTENTS.DESCONHECIDO);
    assert(v2 === 'default', `msg2: deve manter default (sessão já definida), got ${v2}`);
  });

  console.log('\n📋 Excepção de escalação (suporte_conta):');

  await test('suporte_conta sempre força critical_rules mesmo com promptVariant=default', () => {
    const session = { promptVariant: 'default' };
    const v = applyPromptVariantLogic(session, INTENTS.SUPORTE_CONTA);
    assert(v === 'critical_rules', `esperado critical_rules, got ${v}`);
    assert(session.promptVariant === 'critical_rules', 'sessão deve ser actualizada');
  });

  await test('suporte_conta não re-aplica se já é critical_rules (idempotente)', () => {
    const session = { promptVariant: 'critical_rules' };
    const v = applyPromptVariantLogic(session, INTENTS.SUPORTE_CONTA);
    assert(v === 'critical_rules', `esperado critical_rules, got ${v}`);
  });

  await test('fluxo completo: saudação → preço → suporte_conta → muda para critical', () => {
    const session = {};
    applyPromptVariantLogic(session, INTENTS.SAUDACAO);       // msg1: default
    applyPromptVariantLogic(session, INTENTS.VENDA);          // msg2: mantém default
    const v3 = applyPromptVariantLogic(session, INTENTS.SUPORTE_CONTA); // msg3: EXCEPÇÃO → critical
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
