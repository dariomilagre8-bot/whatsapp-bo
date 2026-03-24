'use strict';

// Testes unitários — engine/intel/sendBrief.js
// Mock de global.fetch para interceptar chamadas HTTP

let passed = 0;
let failed = 0;

function test(name, fn) {
  const r = fn();
  if (r && typeof r.then === 'function') {
    return r.then(() => { console.log(`  ✅ ${name}`); passed++; })
            .catch(err => { console.log(`  ❌ ${name}: ${err.message}`); failed++; });
  }
  console.log(`  ✅ ${name}`);
  passed++;
  return Promise.resolve();
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

function freshSendBrief() {
  delete require.cache[require.resolve('../../../engine/intel/sendBrief')];
  return require('../../../engine/intel/sendBrief');
}

console.log('\n🧪 TESTES — engine/intel/sendBrief\n');

const tests = [];

// ── buildUrl ──────────────────────────────────────────────────────────────────
tests.push(test('buildUrl: constrói URL correcta com EVOLUTION_API_URL do env', () => {
  const prev = process.env.EVOLUTION_API_URL;
  process.env.EVOLUTION_API_URL = 'http://jules_whatssiru:80';
  try {
    const { buildUrl } = freshSendBrief();
    const url = buildUrl('ZapPrincipal');
    assert(url.includes('/message/sendText/ZapPrincipal'), `URL inesperada: ${url}`);
    assert(url.startsWith('http://jules_whatssiru:80'), `base errada: ${url}`);
  } finally {
    if (prev === undefined) delete process.env.EVOLUTION_API_URL;
    else process.env.EVOLUTION_API_URL = prev;
  }
}));

// ── resolveInstance ───────────────────────────────────────────────────────────
tests.push(test('resolveInstance: usa BRIEF_INSTANCE_NAME com prioridade', () => {
  const prev = process.env.BRIEF_INSTANCE_NAME;
  process.env.BRIEF_INSTANCE_NAME = 'BriefInstance';
  try {
    const { resolveInstance } = freshSendBrief();
    assert(resolveInstance() === 'BriefInstance', 'esperado BriefInstance');
  } finally {
    if (prev === undefined) delete process.env.BRIEF_INSTANCE_NAME;
    else process.env.BRIEF_INSTANCE_NAME = prev;
  }
}));

// ── sendBrief: payload correcto ───────────────────────────────────────────────
tests.push(test('sendBrief: envia payload correcto (number + text) para Evolution API', async () => {
  const prevFetch = global.fetch;
  const prevInst  = process.env.BRIEF_INSTANCE_NAME;
  const prevUrl   = process.env.EVOLUTION_API_URL;
  const prevKey   = process.env.EVOLUTION_API_KEY;

  process.env.BRIEF_INSTANCE_NAME = 'TestInst';
  process.env.EVOLUTION_API_URL   = 'http://evo.test';
  process.env.EVOLUTION_API_KEY   = 'testkey';

  let capturedBody;
  let capturedUrl;
  let capturedHeaders;

  global.fetch = async (url, opts) => {
    capturedUrl     = url;
    capturedBody    = JSON.parse(opts.body);
    capturedHeaders = opts.headers;
    return { ok: true };
  };

  try {
    const { sendBrief } = freshSendBrief();
    const result = await sendBrief('[PA BRIEF 24h] texto de teste');

    assert(result === true, 'esperado true');
    assert(capturedUrl.includes('/message/sendText/TestInst'), `URL: ${capturedUrl}`);
    assert(capturedBody.number === '244941713216', `number: ${capturedBody.number}`);
    assert(capturedBody.text.includes('[PA BRIEF 24h]'), `text: ${capturedBody.text}`);
    assert(capturedHeaders['apikey'] === 'testkey', `apikey: ${capturedHeaders['apikey']}`);
  } finally {
    global.fetch = prevFetch;
    if (prevInst === undefined) delete process.env.BRIEF_INSTANCE_NAME;
    else process.env.BRIEF_INSTANCE_NAME = prevInst;
    if (prevUrl === undefined) delete process.env.EVOLUTION_API_URL;
    else process.env.EVOLUTION_API_URL = prevUrl;
    if (prevKey === undefined) delete process.env.EVOLUTION_API_KEY;
    else process.env.EVOLUTION_API_KEY = prevKey;
  }
}));

// ── sendBrief: sem instância → retorna false ──────────────────────────────────
tests.push(test('sendBrief: sem instância definida → retorna false sem crash', async () => {
  const prevInst = process.env.BRIEF_INSTANCE_NAME;
  const prevEvo  = process.env.EVOLUTION_INSTANCE;
  const prevEvoN = process.env.EVOLUTION_INSTANCE_NAME;

  delete process.env.BRIEF_INSTANCE_NAME;
  delete process.env.EVOLUTION_INSTANCE;
  delete process.env.EVOLUTION_INSTANCE_NAME;

  try {
    const { sendBrief } = freshSendBrief();
    const result = await sendBrief('texto');
    assert(result === false, 'esperado false quando sem instância');
  } finally {
    if (prevInst !== undefined) process.env.BRIEF_INSTANCE_NAME = prevInst;
    if (prevEvo  !== undefined) process.env.EVOLUTION_INSTANCE  = prevEvo;
    if (prevEvoN !== undefined) process.env.EVOLUTION_INSTANCE_NAME = prevEvoN;
  }
}));

Promise.all(tests).then(() => {
  console.log(`\n📊 sendBrief: ${passed} ok, ${failed} falharam\n`);
  if (failed > 0) process.exit(1);
});
