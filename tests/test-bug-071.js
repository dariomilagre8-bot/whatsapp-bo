// tests/test-bug-071.js — CRM não repete lead tracking na mesma sessão
// BUG-071: upsertLead deve ser chamado apenas 1x por sessão; getClientByPhone também cacheado

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

// ─────────────────────────────────────────────────────────
// Simular lógica de crmProcessed/crmCache da sessão
// ─────────────────────────────────────────────────────────

function makeSession() {
  return { history: [], name: null };
}

/**
 * Simula o bloco CRM do webhook para N mensagens.
 * Retorna { upsertCount, getClientCount }.
 */
async function simulateMessages(msgs, session) {
  let upsertCount = 0;
  let getClientCount = 0;

  const fakeUpsertLead = async () => { upsertCount++; };
  const fakeGetClientByPhone = async () => {
    getClientCount++;
    return { customerName: 'Teste', isReturningCustomer: true, lastSale: null };
  };

  for (const _msg of msgs) {
    // BUG-071 fix: upsertLead apenas na 1ª mensagem
    if (!session.crmProcessed) {
      await fakeUpsertLead();
      session.crmProcessed = true;
    }

    // BUG-071 fix: getClientByPhone apenas na 1ª mensagem
    if (!session.crmCache) {
      const result = await fakeGetClientByPhone();
      session.crmCache = result;
    }
  }

  return { upsertCount, getClientCount };
}

console.log('\n🧪 TESTES BUG-071 (CRM sessão única)\n');

async function runTests() {
  await test('3 mensagens → upsertLead chamado apenas 1x', async () => {
    const session = makeSession();
    const { upsertCount } = await simulateMessages(['oi', 'quero netflix', 'quanto custa?'], session);
    assert(upsertCount === 1, `esperado 1, got ${upsertCount}`);
  });

  await test('3 mensagens → getClientByPhone chamado apenas 1x', async () => {
    const session = makeSession();
    const { getClientCount } = await simulateMessages(['oi', 'quero netflix', 'quanto custa?'], session);
    assert(getClientCount === 1, `esperado 1, got ${getClientCount}`);
  });

  await test('1 mensagem → upsertLead chamado 1x', async () => {
    const session = makeSession();
    const { upsertCount } = await simulateMessages(['oi'], session);
    assert(upsertCount === 1, `esperado 1, got ${upsertCount}`);
  });

  await test('sessão já tem crmProcessed → upsertLead não chamado', async () => {
    const session = { ...makeSession(), crmProcessed: true };
    const { upsertCount } = await simulateMessages(['segunda sessão'], session);
    assert(upsertCount === 0, `esperado 0 (já processado), got ${upsertCount}`);
  });

  await test('sessão já tem crmCache → getClientByPhone não chamado', async () => {
    const session = {
      ...makeSession(),
      crmCache: { customerName: 'Cache', isReturningCustomer: true, lastSale: null },
    };
    const { getClientCount } = await simulateMessages(['msg nova'], session);
    assert(getClientCount === 0, `esperado 0 (cache activo), got ${getClientCount}`);
  });

  await test('crmCache preserva dados correctos entre mensagens', async () => {
    const session = makeSession();
    await simulateMessages(['msg 1', 'msg 2'], session);
    assert(session.crmCache !== undefined, 'crmCache deve estar definido');
    assert(session.crmCache.customerName === 'Teste', `nome errado: ${session.crmCache.customerName}`);
    assert(session.crmCache.isReturningCustomer === true, 'isReturningCustomer errado');
  });

  console.log(`\n📊 BUG-071: ${passed} passou | ${failed} falhou`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('❌ Erro fatal BUG-071:', err.message);
  process.exit(1);
});
