// tests/crm.test.js — Testes unitários de engine/lib/crm.js

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

// ─────────────────────────────────────────────────────────────
// Mock do supabase proxy para testar sem BD real
// ─────────────────────────────────────────────────────────────
function makeSupabaseMock(returnData, returnError = null) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          return { data: returnData, error: returnError };
        },
      };
    },
  };
}

// Patch engine/lib/supabase para cada teste
function patchSupabase(mock) {
  const key = Object.keys(require.cache).find(
    k => k.includes('engine/lib/supabase') || k.includes('engine\\lib\\supabase')
  );
  if (key) delete require.cache[key];

  // Também remover crm do cache para reload com novo supabase
  const crmKey = Object.keys(require.cache).find(
    k => k.includes('engine/lib/crm') || k.includes('engine\\lib\\crm')
  );
  if (crmKey) delete require.cache[crmKey];

  // Registar o mock no cache
  require.cache[require.resolve('../engine/lib/supabase')] = {
    id: require.resolve('../engine/lib/supabase'),
    filename: require.resolve('../engine/lib/supabase'),
    loaded: true,
    exports: mock,
  };
  return require('../engine/lib/crm');
}

// ─────────────────────────────────────────────────────────────
console.log('\n🧪 TESTES CRM (engine/lib/crm.js)\n');

async function runTests() {

  // ── classifyClient ──
  console.log('📋 classifyClient:');

  await test('null → new_lead', () => {
    // classifyClient é uma função pura, sem dependências externas
    const crmKey = Object.keys(require.cache).find(
      k => k.includes('engine/lib/crm') || k.includes('engine\\lib\\crm')
    );
    if (crmKey) delete require.cache[crmKey];
    // Registar supabase mock mínimo para permitir require
    require.cache[require.resolve('../engine/lib/supabase')] = {
      id: require.resolve('../engine/lib/supabase'),
      filename: require.resolve('../engine/lib/supabase'),
      loaded: true,
      exports: makeSupabaseMock(null),
    };
    const { classifyClient } = require('../engine/lib/crm');
    assert(classifyClient(null) === 'new_lead', `esperado new_lead, got ${classifyClient(null)}`);
  });

  await test('status active → active', () => {
    const { classifyClient } = require('../engine/lib/crm');
    assert(classifyClient({ status: 'active' }) === 'active');
  });

  await test('status expired → expired', () => {
    const { classifyClient } = require('../engine/lib/crm');
    assert(classifyClient({ status: 'expired' }) === 'expired');
  });

  await test('status cancelled → cancelled', () => {
    const { classifyClient } = require('../engine/lib/crm');
    assert(classifyClient({ status: 'cancelled' }) === 'cancelled');
  });

  await test('status trial → trial', () => {
    const { classifyClient } = require('../engine/lib/crm');
    assert(classifyClient({ status: 'trial' }) === 'trial');
  });

  await test('objeto sem status → active (default)', () => {
    const { classifyClient } = require('../engine/lib/crm');
    // Objeto existente mas sem status → cai no return 'active'
    assert(classifyClient({ phone: '244999000000' }) === 'active');
  });

  // ── getClientByPhone (com mock) ──
  console.log('\n📋 getClientByPhone (com mock Supabase):');

  await test('cliente existente retorna objecto', async () => {
    const fakeCliente = { phone: '244900000001', name: 'Ana', status: 'active', client_slug: 'streamzone' };
    const crm = patchSupabase(makeSupabaseMock(fakeCliente));
    const result = await crm.getClientByPhone('244900000001');
    assert(result !== null, 'esperado objecto, got null');
    assert(result.phone === '244900000001', 'phone errado');
    assert(result.name === 'Ana', 'nome errado');
  });

  await test('cliente inexistente retorna null', async () => {
    const crm = patchSupabase(makeSupabaseMock(null));
    const result = await crm.getClientByPhone('244900000099');
    assert(result === null, `esperado null, got ${JSON.stringify(result)}`);
  });

  await test('normaliza telefone: remove chars não-dígitos', async () => {
    let capturedPhone = null;
    const captureMock = {
      from() {
        return {
          select() { return this; },
          eq(col, val) {
            if (col === 'phone') capturedPhone = val;
            return this;
          },
          async maybeSingle() { return { data: null, error: null }; },
        };
      },
    };
    const crm = patchSupabase(captureMock);
    await crm.getClientByPhone('+244 900-000-001');
    assert(capturedPhone === '244900000001', `esperado 244900000001, got "${capturedPhone}"`);
  });

  await test('erro do Supabase → lança erro', async () => {
    const crm = patchSupabase(makeSupabaseMock(null, { message: 'connection failed' }));
    let threw = false;
    try {
      await crm.getClientByPhone('244900000001');
    } catch (err) {
      threw = true;
      assert(err.message === 'connection failed', `mensagem errada: ${err.message}`);
    }
    assert(threw, 'esperava que lançasse erro');
  });

  await test('fluxo completo: getClientByPhone + classifyClient → expired', async () => {
    const fakeCliente = { phone: '244900000002', name: 'Bob', status: 'expired', client_slug: 'streamzone' };
    const crm = patchSupabase(makeSupabaseMock(fakeCliente));
    const client = await crm.getClientByPhone('244900000002');
    const type = crm.classifyClient(client);
    assert(type === 'expired', `esperado expired, got ${type}`);
  });

  await test('fluxo completo: cliente null → new_lead', async () => {
    const crm = patchSupabase(makeSupabaseMock(null));
    const client = await crm.getClientByPhone('244900000003');
    const type = crm.classifyClient(client);
    assert(type === 'new_lead', `esperado new_lead, got ${type}`);
  });

  // ── Resultado ──
  console.log(`\n📊 Resultado CRM: ${passed} passou | ${failed} falhou`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('❌ Erro fatal CRM tests:', err.message);
  process.exit(1);
});
