'use strict';
// tests/engine/queue/deadLetterQueue.test.js — Testa DLQ: job falhado 3x vai para pa-dead-letters

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

console.log('\n🧪 TESTES — engine/queue/deadLetterQueue\n');

// ── Mock BullMQ ──────────────────────────────────────────────────────────────
const dlqJobs = [];

require.cache[require.resolve('bullmq')] = {
  id: require.resolve('bullmq'),
  filename: require.resolve('bullmq'),
  loaded: true,
  exports: {
    Queue: class MockDLQ {
      constructor(name) { this.name = name; }
      add(type, data) {
        dlqJobs.push({ type, data, queueName: this.name });
        return Promise.resolve({ id: 'dlq-' + Date.now() });
      }
    },
    Worker: class MockWorker {
      constructor() {}
      on() { return this; }
    },
  },
};

process.env.REDIS_URL = 'redis://:testpass@localhost:6379';

const { createDLQ, addDeadLetter, getDLQ, _reset } = require('../../../engine/queue/deadLetterQueue');

const tests = [];

tests.push(test('createDLQ: cria queue com nome pa-dead-letters', () => {
  _reset();
  const q = createDLQ();
  assert(q !== null, 'DLQ não pode ser null');
  assert(q.name === 'pa-dead-letters', `nome esperado pa-dead-letters, got ${q.name}`);
}));

tests.push(test('createDLQ: singleton — segunda chamada devolve mesma instância', () => {
  const q1 = createDLQ();
  const q2 = createDLQ();
  assert(q1 === q2, 'deve ser a mesma instância');
}));

tests.push(test('addDeadLetter: adiciona job à DLQ com dados correctos', async () => {
  _reset();
  dlqJobs.length = 0;
  const originalMessage = { body: { test: true }, instanceName: 'Inst1', traceId: 't1', clientSlug: 'demo' };
  const errorStack = 'Error: falhou\n  at fn (file.js:10)';
  const timestamp = new Date().toISOString();
  const clientId = 'demo';

  const job = await addDeadLetter({ originalMessage, errorStack, timestamp, clientId });
  assert(job !== null, 'job não pode ser null');
  assert(dlqJobs.length === 1, `esperado 1 job, got ${dlqJobs.length}`);
  assert(dlqJobs[0].type === 'dead-letter', `tipo errado: ${dlqJobs[0].type}`);
  assert(dlqJobs[0].queueName === 'pa-dead-letters', 'queue errada');
}));

tests.push(test('addDeadLetter: payload contém todos os campos obrigatórios', async () => {
  _reset();
  dlqJobs.length = 0;
  const ts = '2026-01-01T00:00:00.000Z';
  await addDeadLetter({
    originalMessage: { msg: 'test' },
    errorStack: 'stack trace',
    timestamp: ts,
    clientId: 'streamzone',
  });
  const d = dlqJobs[0].data;
  assert(d.originalMessage !== undefined, 'originalMessage em falta');
  assert(d.errorStack === 'stack trace', 'errorStack errado');
  assert(d.timestamp === ts, 'timestamp errado');
  assert(d.clientId === 'streamzone', 'clientId errado');
}));

tests.push(test('getDLQ: devolve null antes de createDLQ', () => {
  _reset();
  assert(getDLQ() === null, 'getDLQ deve ser null antes de criar');
}));

tests.push(test('getDLQ: devolve instância após createDLQ', () => {
  createDLQ();
  assert(getDLQ() !== null, 'getDLQ deve devolver instância');
}));

tests.push(test('addDeadLetter: lança erro se REDIS_URL não definido', async () => {
  _reset();
  delete process.env.REDIS_URL;
  let threw = false;
  try {
    await addDeadLetter({ originalMessage: {}, errorStack: '', timestamp: '', clientId: '' });
  } catch {
    threw = true;
  }
  process.env.REDIS_URL = 'redis://:testpass@localhost:6379';
  assert(threw, 'devia lançar erro sem REDIS_URL');
}));

Promise.all(tests).then(() => {
  console.log(`\n📊 deadLetterQueue: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
});
