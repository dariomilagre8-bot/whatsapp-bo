'use strict';

// Testes unitários — engine/intel/dailyBrief.js
// Mock do Supabase e Redis via Module patching antes do require

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log(`  ✅ ${name}`); passed++; })
              .catch(err => { console.log(`  ❌ ${name}: ${err.message}`); failed++; });
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertIncludes(str, sub) { assert(str.includes(sub), `"${sub}" não encontrado em:\n${str}`); }

// ── helpers de mock ───────────────────────────────────────────────────────────

function mockSupabase(rows) {
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (req, ...args) {
    if (req === '../lib/supabase' || req.endsWith('engine/lib/supabase')) {
      return {
        from: () => ({
          select: () => ({
            gte: async () => ({ data: rows, error: null }),
          }),
        }),
      };
    }
    return origLoad.call(this, req, ...args);
  };
  return () => { Module._load = origLoad; };
}

function mockRedis(queueSizes = {}) {
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (req, ...args) {
    if (req === '../lib/dedup' || req.endsWith('engine/lib/dedup')) {
      return {
        getRedis: () => ({
          llen: async (q) => queueSizes[q] || 0,
        }),
      };
    }
    return origLoad.call(this, req, ...args);
  };
  return () => { Module._load = origLoad; };
}

// Limpa cache do módulo para garantir mocks frescos a cada teste
function freshBrief() {
  delete require.cache[require.resolve('../../../engine/intel/dailyBrief')];
  return require('../../../engine/intel/dailyBrief');
}

console.log('\n🧪 TESTES — engine/intel/dailyBrief\n');

// ── Cenário 1: dados normais (3 bots com mensagens) ──────────────────────────
const tests = [];

tests.push(test('Cenário normal: 3 bots com dados → gera brief correcto', async () => {
  const rows = [
    { client_id: 'streamzone', response_time_ms: 2000, llm_success: true,  resolution_type: null },
    { client_id: 'streamzone', response_time_ms: 3000, llm_success: false, resolution_type: 'human_escalated' },
    { client_id: 'luna',       response_time_ms: 1500, llm_success: true,  resolution_type: null },
    { client_id: 'demo',       response_time_ms: 4000, llm_success: true,  resolution_type: 'abandoned' },
  ];

  const restoreSupa = mockSupabase(rows);
  const restoreRedis = mockRedis({ 'pa-messages': 10, 'pa-dead-letters': 0 });

  try {
    const brief = await freshBrief().generateBrief();
    assertIncludes(brief, '[PA BRIEF 24h]');
    assertIncludes(brief, 'Zara: 2 msgs');
    assertIncludes(brief, 'Luna: 1 msgs');
    assertIncludes(brief, 'Bia: 1 msgs');
    assertIncludes(brief, 'DLQ: 0 pendentes');
    assertIncludes(brief, 'ALERTAS:');
    assertIncludes(brief, 'Nenhum');
  } finally {
    restoreSupa(); restoreRedis();
  }
}));

// ── Cenário 2: bot com 0 mensagens → alerta DOWN ─────────────────────────────
tests.push(test('Cenário bot down: 1 bot com 0 msgs → alerta incluído', async () => {
  const rows = [
    { client_id: 'streamzone', response_time_ms: 1000, llm_success: true, resolution_type: null },
    // luna e demo sem mensagens
  ];

  const restoreSupa = mockSupabase(rows);
  const restoreRedis = mockRedis({ 'pa-dead-letters': 0 });

  try {
    const brief = await freshBrief().generateBrief();
    assertIncludes(brief, '⚠ Luna: 0 mensagens (possível DOWN)');
    assertIncludes(brief, '⚠ Bia: 0 mensagens (possível DOWN)');
  } finally {
    restoreSupa(); restoreRedis();
  }
}));

// ── Cenário 3: DLQ > 0 → alerta DLQ ─────────────────────────────────────────
tests.push(test('Cenário DLQ cheia: DLQ > 0 → alerta incluído', async () => {
  const rows = [
    { client_id: 'streamzone', response_time_ms: 1000, llm_success: true, resolution_type: null },
    { client_id: 'luna',       response_time_ms: 1000, llm_success: true, resolution_type: null },
    { client_id: 'demo',       response_time_ms: 1000, llm_success: true, resolution_type: null },
  ];

  const restoreSupa = mockSupabase(rows);
  const restoreRedis = mockRedis({ 'pa-messages': 5, 'pa-dead-letters': 3 });

  try {
    const brief = await freshBrief().generateBrief();
    assertIncludes(brief, '⚠ DLQ: 3 mensagens falhadas — verificar');
    assertIncludes(brief, 'DLQ: 3 pendentes');
  } finally {
    restoreSupa(); restoreRedis();
  }
}));

// ── Cenário 4: resposta lenta avg > 5s → alerta ──────────────────────────────
tests.push(test('Cenário resposta lenta: avg > 5s → alerta incluído', async () => {
  const rows = [
    { client_id: 'streamzone', response_time_ms: 8000, llm_success: true, resolution_type: null },
    { client_id: 'streamzone', response_time_ms: 9000, llm_success: true, resolution_type: null },
    { client_id: 'luna',       response_time_ms: 1000, llm_success: true, resolution_type: null },
    { client_id: 'demo',       response_time_ms: 1000, llm_success: true, resolution_type: null },
  ];

  const restoreSupa = mockSupabase(rows);
  const restoreRedis = mockRedis({ 'pa-dead-letters': 0 });

  try {
    const brief = await freshBrief().generateBrief();
    assertIncludes(brief, '⚠ Zara: resposta lenta');
  } finally {
    restoreSupa(); restoreRedis();
  }
}));

// ── Cenário 5: Supabase indisponível → graceful ───────────────────────────────
tests.push(test('Cenário Supabase indisponível → brief com aviso parcial', async () => {
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (req, ...args) {
    if (req === '../lib/supabase' || req.endsWith('engine/lib/supabase')) {
      return {
        from: () => ({
          select: () => ({
            gte: async () => { throw new Error('Connection refused'); },
          }),
        }),
      };
    }
    return origLoad.call(this, req, ...args);
  };
  const restoreRedis = mockRedis({ 'pa-dead-letters': 0 });

  try {
    const brief = await freshBrief().generateBrief();
    assertIncludes(brief, '[PA BRIEF 24h]');
    assertIncludes(brief, '⚠ Supabase: dados indisponíveis');
  } finally {
    Module._load = origLoad;
    restoreRedis();
  }
}));

Promise.all(tests).then(() => {
  console.log(`\n📊 dailyBrief: ${passed} ok, ${failed} falharam\n`);
  if (failed > 0) process.exit(1);
});
