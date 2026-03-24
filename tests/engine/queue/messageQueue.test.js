'use strict';
// tests/engine/queue/messageQueue.test.js — Testa addMessage, worker mock, retry config

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
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('\n🧪 TESTES — engine/queue/messageQueue\n');

// ── Mock BullMQ ──────────────────────────────────────────────────────────────
const addedJobs = [];
const workers = [];

require.cache[require.resolve('bullmq')] = {
  id: require.resolve('bullmq'),
  filename: require.resolve('bullmq'),
  loaded: true,
  exports: {
    Queue: class MockQueue {
      constructor(name) { this.name = name; }
      add(type, data) {
        addedJobs.push({ type, data });
        return Promise.resolve({ id: 'job-' + Date.now() });
      }
    },
    Worker: class MockWorker {
      constructor(name, processor, opts) {
        this.name = name;
        this.processor = processor;
        this.opts = opts;
        this.closing = false;
        this._events = {};
        workers.push(this);
      }
      on(event, fn) { this._events[event] = fn; return this; }
      emit(event, ...args) { if (this._events[event]) this._events[event](...args); }
    },
  },
};

const { createQueue, createWorker, addMessage, getWorker, _reset } = require('../../../engine/queue/messageQueue');

// ── Setup env ────────────────────────────────────────────────────────────────
process.env.REDIS_URL = 'redis://:testpass@localhost:6379';

const registry = {
  'TestInstance': {
    config: { slug: 'test-client', evolutionInstance: 'TestInstance' },
    handler: async (req) => { req._processed = true; },
  },
};

const tests = [];

tests.push(test('createQueue: devolve instância MockQueue com nome correcto', () => {
  _reset();
  const q = createQueue();
  assert(q !== null, 'queue não pode ser null');
  assert(q.name === 'pa-messages', `nome esperado pa-messages, got ${q.name}`);
}));

tests.push(test('createQueue: singleton — segunda chamada devolve mesma instância', () => {
  const q1 = createQueue();
  const q2 = createQueue();
  assert(q1 === q2, 'deve ser a mesma instância');
}));

tests.push(test('addMessage: chama queue.add com payload correcto', async () => {
  addedJobs.length = 0;
  const payload = { body: { data: { key: { id: 'abc' } } }, instanceName: 'TestInstance', traceId: 't1', clientSlug: 'test' };
  await addMessage(payload);
  assert(addedJobs.length === 1, `esperado 1 job, got ${addedJobs.length}`);
  assert(addedJobs[0].type === 'process-message', 'tipo errado');
  assert(addedJobs[0].data.instanceName === 'TestInstance', 'instanceName errado');
}));

tests.push(test('createWorker: cria worker com registry e regista event listeners', () => {
  _reset();
  workers.length = 0;
  createQueue();
  const w = createWorker(registry);
  assert(w !== null, 'worker não pode ser null');
  assert(workers.length >= 1, 'worker deve estar no array');
  assert(typeof w._events.completed === 'function', 'listener completed em falta');
  assert(typeof w._events.failed === 'function', 'listener failed em falta');
  assert(typeof w._events.stalled === 'function', 'listener stalled em falta');
}));

tests.push(test('worker: processa job com handler do registry', async () => {
  let handlerCalled = false;
  const reg = {
    'Inst1': {
      config: { slug: 'slug1', evolutionInstance: 'Inst1' },
      handler: async (req) => { handlerCalled = true; },
    },
  };
  _reset();
  workers.length = 0;
  createQueue();
  createWorker(reg);
  const w = workers[workers.length - 1];
  const job = { id: 'j1', data: { body: {}, instanceName: 'Inst1', traceId: 'tr1', clientSlug: 'slug1' }, attemptsMade: 1, opts: { attempts: 3 } };
  await w.processor(job);
  assert(handlerCalled, 'handler devia ter sido chamado');
}));

tests.push(test('worker: lança erro se instância não encontrada no registry', async () => {
  const reg = {};
  _reset();
  workers.length = 0;
  createQueue();
  createWorker(reg);
  const w = workers[workers.length - 1];
  const job = { id: 'j2', data: { body: {}, instanceName: 'INEXISTENTE', traceId: 'tr2', clientSlug: 'x' }, attemptsMade: 1 };
  let threw = false;
  try {
    await w.processor(job);
  } catch {
    threw = true;
  }
  assert(threw, 'devia lançar erro para instância inexistente');
}));

tests.push(test('getWorker: devolve worker após createWorker', () => {
  const w = getWorker();
  assert(w !== null, 'getWorker deve devolver o worker');
}));

Promise.all(tests).then(() => {
  console.log(`\n📊 messageQueue: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
});
