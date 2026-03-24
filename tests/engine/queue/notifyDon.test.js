'use strict';
// tests/engine/queue/notifyDon.test.js — Testa geração de mensagem e envio via Evolution API (mock fetch)

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

console.log('\n🧪 TESTES — engine/alerts/notifyDon\n');

const { notifyDon, buildAlertMessage, buildRenewalSummaryMessage } = require('../../../engine/alerts/notifyDon');

// ── Setup env ────────────────────────────────────────────────────────────────
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

tests.push(test('buildAlertMessage: gera mensagem com formato correcto', () => {
  const msg = buildAlertMessage('streamzone', 'Connection timeout');
  assert(msg.includes('[PA ALERTA]'), 'deve incluir [PA ALERTA]');
  assert(msg.includes('streamzone'), 'deve incluir client slug');
  assert(msg.includes('3x'), 'deve mencionar 3x');
  assert(msg.includes('Connection timeout'), 'deve incluir erro');
}));

tests.push(test('buildAlertMessage: trunca erros longos (>300 chars)', () => {
  const longError = 'A'.repeat(400);
  const msg = buildAlertMessage('demo', longError);
  assert(msg.length < 500, 'mensagem deve ser truncada');
}));

tests.push(test('buildRenewalSummaryMessage: formato [PA RENOVAÇÃO] e falhas', () => {
  const a = buildRenewalSummaryMessage({ templateKey: 'AVISO_3_DIAS', sent: 3, failed: 0, failedNames: [] });
  assert(a.includes('[PA RENOVAÇÃO]') && a.includes('AVISO_3_DIAS') && a.includes('Falhas: 0'), a);
  const b = buildRenewalSummaryMessage({ templateKey: 'AVISO_DIA', sent: 1, failed: 1, failedNames: ['X'] });
  assert(b.includes('Falhas: 1') && b.includes('Falharam: X'), b);
}));

tests.push(test('notifyDon: devolve false se ALERT_INSTANCE_NAME não definido', async () => {
  setEnv({ ALERT_INSTANCE_NAME: undefined, EVOLUTION_API_URL: 'http://evo.test', EVOLUTION_API_KEY: 'key' });
  const result = await notifyDon('streamzone', 'erro');
  restoreEnv();
  assert(result === false, 'deve devolver false sem ALERT_INSTANCE_NAME');
}));

tests.push(test('notifyDon: devolve false se EVOLUTION_API_URL não definido', async () => {
  setEnv({ ALERT_INSTANCE_NAME: 'TestInst', EVOLUTION_API_URL: undefined, EVOLUTION_API_KEY: 'key' });
  const result = await notifyDon('demo', 'erro');
  restoreEnv();
  assert(result === false, 'deve devolver false sem EVOLUTION_API_URL');
}));

tests.push(test('notifyDon: chama Evolution API com URL e body correctos', async () => {
  const prevFetch = global.fetch;
  let capturedUrl = '';
  let capturedBody = null;
  global.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    return { ok: true };
  };
  setEnv({
    ALERT_INSTANCE_NAME: 'AlertBot',
    EVOLUTION_API_URL: 'http://evo.internal',
    EVOLUTION_API_KEY: 'secret123',
    ALERT_PHONE: '244941713216',
  });
  const result = await notifyDon('streamzone', 'LLM circuit aberto');
  restoreEnv();
  global.fetch = prevFetch;
  assert(result === true, `devia devolver true, got ${result}`);
  assert(capturedUrl.includes('/message/sendText/AlertBot'), `URL errada: ${capturedUrl}`);
  assert(capturedBody.number === '244941713216@s.whatsapp.net', `JID errado: ${capturedBody.number}`);
  assert(capturedBody.text.includes('[PA ALERTA]'), 'texto sem prefixo [PA ALERTA]');
  assert(capturedBody.text.includes('streamzone'), 'texto sem client slug');
}));

tests.push(test('notifyDon: devolve false se Evolution API retornar erro HTTP', async () => {
  const prevFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'Internal Error' });
  setEnv({ ALERT_INSTANCE_NAME: 'Inst', EVOLUTION_API_URL: 'http://x', EVOLUTION_API_KEY: 'k' });
  const result = await notifyDon('demo', 'erro');
  restoreEnv();
  global.fetch = prevFetch;
  assert(result === false, 'deve devolver false em erro HTTP');
}));

tests.push(test('notifyDon: devolve false se fetch lançar excepção de rede', async () => {
  const prevFetch = global.fetch;
  global.fetch = async () => { throw new Error('ECONNREFUSED'); };
  setEnv({ ALERT_INSTANCE_NAME: 'Inst', EVOLUTION_API_URL: 'http://x', EVOLUTION_API_KEY: 'k' });
  const result = await notifyDon('demo', 'erro rede');
  restoreEnv();
  global.fetch = prevFetch;
  assert(result === false, 'deve devolver false em erro de rede');
}));

tests.push(test('notifyDon: usa ALERT_PHONE padrão 244941713216 se não definido', async () => {
  const prevFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (_, opts) => { capturedBody = JSON.parse(opts.body); return { ok: true }; };
  setEnv({ ALERT_INSTANCE_NAME: 'Inst', EVOLUTION_API_URL: 'http://x', EVOLUTION_API_KEY: 'k', ALERT_PHONE: undefined });
  await notifyDon('demo', 'err');
  restoreEnv();
  global.fetch = prevFetch;
  assert(capturedBody.number === '244941713216@s.whatsapp.net', `JID padrão errado: ${capturedBody?.number}`);
}));

Promise.all(tests).then(() => {
  console.log(`\n📊 notifyDon: ${passed} ok, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
});
