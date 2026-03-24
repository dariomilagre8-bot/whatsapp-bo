'use strict';
// tests/engine/queue/readyCheck.test.js — Testa health check /ready (Redis + Supabase + Queue)

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log(`  ✅ ${name}`); passed++; })
              .catch((err) => { console.log(`  ❌ ${name}: ${err.message}`); failed++; });
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('\n🧪 TESTES — engine/health/readyCheck\n');

const { getReadyStatus, checkQueue } = require('../../../engine/health/readyCheck');

// ── Helpers env ─────────────────────────────────────────────────────────────
const savedEnv = {};
function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) {
    savedEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const tests = [];

// ── checkQueue (síncrono) ────────────────────────────────────────────────────
tests.push(test('checkQueue: devolve false se getWorkerFn não for função', () => {
  assert(checkQueue(null) === false, 'deve ser false para null');
  assert(checkQueue(undefined) === false, 'deve ser false para undefined');
}));

tests.push(test('checkQueue: devolve false se worker.closing === true', () => {
  const getWorkerFn = () => ({ closing: true });
  assert(checkQueue(getWorkerFn) === false, 'worker fechando deve ser false');
}));

tests.push(test('checkQueue: devolve true se worker activo (closing === false)', () => {
  const getWorkerFn = () => ({ closing: false });
  assert(checkQueue(getWorkerFn) === true, 'worker activo deve ser true');
}));

tests.push(test('checkQueue: devolve false se getWorkerFn lançar excepção', () => {
  const getWorkerFn = () => { throw new Error('crash'); };
  assert(checkQueue(getWorkerFn) === false, 'deve ser false em caso de erro');
}));

tests.push(test('checkQueue: devolve false se worker for null', () => {
  const getWorkerFn = () => null;
  assert(checkQueue(getWorkerFn) === false, 'null worker deve ser false');
}));

// ── getReadyStatus (assíncrono, com mocks fetch + ioredis) ──────────────────
tests.push(test('getReadyStatus: status ok quando todos os checks passam', async () => {
  const prevFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200 });

  // Mock ioredis
  const origIoredis = require.cache[require.resolve('ioredis')];
  require.cache[require.resolve('ioredis')] = {
    id: require.resolve('ioredis'),
    filename: require.resolve('ioredis'),
    loaded: true,
    exports: class MockRedis {
      constructor() {}
      async connect() {}
      async ping() { return 'PONG'; }
      quit() { return Promise.resolve(); }
    },
  };

  setEnv({
    REDIS_URL: 'redis://localhost:6379',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'testkey',
  });

  const result = await getReadyStatus(() => ({ closing: false }));
  restoreEnv();
  global.fetch = prevFetch;
  if (origIoredis) require.cache[require.resolve('ioredis')] = origIoredis;
  else delete require.cache[require.resolve('ioredis')];

  assert(result.status === 'ok', `status esperado ok, got ${result.status}`);
  assert(result.redis === true, 'redis deve ser true');
  assert(result.supabase === true, 'supabase deve ser true');
  assert(result.queue === true, 'queue deve ser true');
}));

tests.push(test('getReadyStatus: status degraded quando Redis falha', async () => {
  const prevFetch = global.fetch;
  global.fetch = async () => ({ ok: true });

  const origIoredis = require.cache[require.resolve('ioredis')];
  require.cache[require.resolve('ioredis')] = {
    id: require.resolve('ioredis'),
    filename: require.resolve('ioredis'),
    loaded: true,
    exports: class FailRedis {
      constructor() {}
      async connect() { throw new Error('Connection refused'); }
      quit() { return Promise.resolve(); }
    },
  };

  setEnv({ REDIS_URL: 'redis://localhost:9999', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' });
  const result = await getReadyStatus(() => ({ closing: false }));
  restoreEnv();
  global.fetch = prevFetch;
  if (origIoredis) require.cache[require.resolve('ioredis')] = origIoredis;

  assert(result.status === 'degraded', `status esperado degraded, got ${result.status}`);
  assert(result.redis === false, 'redis deve ser false');
}));

tests.push(test('getReadyStatus: status degraded quando queue worker não activo', async () => {
  const prevFetch = global.fetch;
  global.fetch = async () => ({ ok: true });

  const origIoredis = require.cache[require.resolve('ioredis')];
  require.cache[require.resolve('ioredis')] = {
    id: require.resolve('ioredis'),
    filename: require.resolve('ioredis'),
    loaded: true,
    exports: class MockRedis {
      constructor() {}
      async connect() {}
      async ping() { return 'PONG'; }
      quit() { return Promise.resolve(); }
    },
  };

  setEnv({ REDIS_URL: 'redis://localhost:6379', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' });
  const result = await getReadyStatus(null); // sem worker
  restoreEnv();
  global.fetch = prevFetch;
  if (origIoredis) require.cache[require.resolve('ioredis')] = origIoredis;

  assert(result.status === 'degraded', `status esperado degraded, got ${result.status}`);
  assert(result.queue === false, 'queue deve ser false sem worker');
}));

tests.push(test('getReadyStatus: resposta tem todas as chaves esperadas', async () => {
  const result = await getReadyStatus(null);
  assert('status' in result, 'falta chave status');
  assert('redis' in result, 'falta chave redis');
  assert('supabase' in result, 'falta chave supabase');
  assert('queue' in result, 'falta chave queue');
}));

Promise.all(tests).then(() => {
  console.log(`\n📊 readyCheck: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
});
