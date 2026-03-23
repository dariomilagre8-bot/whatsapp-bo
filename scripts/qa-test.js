// scripts/qa-test.js — QA-as-a-Judge: CLI pré-deploy
// Uso: node scripts/qa-test.js --client=streamzone [--mock]
// CommonJS | Node.js 20

const path = require('path');
const { loadScenario, checkResponse, calculateScore } = require('../engine/lib/qa-runner');

// Aliases para slugs de cliente (ex: demo-moda → demo)
const SLUG_ALIASES = { 'demo-moda': 'demo', 'streamzone-braulio': 'streamzone' };

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const rawSlug  = args.client || 'streamzone';
const clientSlug = SLUG_ALIASES[rawSlug] || rawSlug;
const useMock  = args.mock === true || args.mock === 'true';

function loadClientConfig(slug) {
  try {
    return require(path.join(__dirname, '..', 'clients', slug, 'config.js'));
  } catch (e) {
    console.error(`[QA] Config não encontrada para cliente "${slug}": ${e.message}`);
    process.exit(1);
  }
}

async function mockGenerate(msg) {
  return `Olá! Obrigado pela sua mensagem. Como posso ajudar com "${msg.substring(0, 40)}"?`;
}

async function realGenerate(msg, clientConfig) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return mockGenerate(msg);
  try {
    const { init, generate, buildDynamicPrompt } = require('../engine/lib/llm');
    init(apiKey);
    const prompt = buildDynamicPrompt(null, 'Cliente QA', false, null, {}, null, clientConfig);
    return await generate(prompt, msg, [], clientConfig);
  } catch (_) {
    return mockGenerate(msg);
  }
}

function printRow(s, checks, elapsed, response) {
  const ic = k => checks[k] ? '✅' : '❌';
  const detail = !checks.safe
    ? ` (${checks.safeDetail})`
    : !checks.intent ? ` (det:${checks.detectedIntent})` : '';
  console.log(`  MSG : "${s.msg}"`);
  console.log(`  [⏱ timeout=${ic('timeout')}] [🛡 safe=${ic('safe')}${detail}] [🎯 intent=${ic('intent')}] [😀 emoji=${ic('emoji')}] [📝 valid=${ic('valid')}]`);
  console.log(`  Resp (${elapsed}ms): "${response.substring(0, 72)}..."\n`);
}

async function main() {
  const clientConfig = loadClientConfig(clientSlug);
  const { nicho, scenarios } = loadScenario(clientConfig);
  const mode = useMock ? 'MOCK' : 'LLM';

  console.log(`\n🔍 QA — cliente: ${clientSlug} | nicho: ${nicho} | cenários: ${scenarios.length} | modo: ${mode}`);
  console.log('─'.repeat(72));

  const results = [];

  for (const s of scenarios) {
    const t0 = Date.now();
    const response = useMock
      ? await mockGenerate(s.msg)
      : await realGenerate(s.msg, clientConfig);
    const elapsed = Date.now() - t0;
    const checks = checkResponse(s.msg, response, s.expectedIntent, clientConfig, elapsed);
    results.push({ msg: s.msg, checks, elapsed });
    printRow(s, checks, elapsed, response);
  }

  const score = calculateScore(results);
  const status = score >= 80 ? '✅ PASS' : '❌ FAIL';

  console.log('─'.repeat(72));
  console.log(`\n📊 Score: ${score}/100 — ${status}`);

  if (score < 80) {
    console.log('⚠️  Score abaixo de 80. Deploy BLOQUEADO.\n');
    process.exit(1);
  }
  console.log('🚀 QA aprovado. Deploy pode avançar.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('[QA] Erro fatal:', err.message);
  process.exit(1);
});
