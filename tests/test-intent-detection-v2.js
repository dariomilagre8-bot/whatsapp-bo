// tests/test-intent-detection-v2.js — BUG-074 intent v2 (venda vs suporte)

const { detectIntent, INTENTS } = require('../src/engine/intentDetector');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

const SZ = 'streamzone';

const testCases = [
  { input: 'Tem plano de 3 ecrãs?', expected: INTENTS.VENDA, slug: SZ },
  { input: 'Quanto custa o Netflix?', expected: INTENTS.VENDA, slug: SZ },
  { input: 'Quero o plano família', expected: INTENTS.VENDA, slug: SZ },
  { input: 'Têm pacotes do Disney plus?', expected: INTENTS.DESCONHECIDO, slug: SZ },
  { input: 'Para 3 pessoas', expected: INTENTS.DESCONHECIDO, slug: SZ },
  { input: 'Tem plano individual?', expected: INTENTS.VENDA, slug: SZ },
  { input: 'Qual o preço da partilha?', expected: INTENTS.VENDA, slug: SZ },
  { input: 'Quero assistir hanna Montana', expected: INTENTS.DESCONHECIDO, slug: SZ },
  { input: 'O meu plano expirou', expected: INTENTS.SUPORTE_CONTA, slug: SZ },
  { input: 'Não consigo entrar na conta', expected: INTENTS.SUPORTE_CONTA, slug: SZ },
  { input: 'Preciso do código de verificação', expected: INTENTS.SUPORTE_CONTA, slug: SZ },
  { input: 'Paguei mas não recebi acesso', expected: INTENTS.SUPORTE_CONTA, slug: SZ },
  { input: 'A conta está bloqueada', expected: INTENTS.SUPORTE_CONTA, slug: SZ },
  { input: 'Oi', expected: INTENTS.SAUDACAO, slug: SZ },
  { input: 'Boa tarde prezados', expected: INTENTS.SAUDACAO, slug: SZ },
  { input: 'Bom dia', expected: INTENTS.SAUDACAO, slug: SZ },
  { input: 'O meu plano actual é bom mas quero mudar', expected: INTENTS.VENDA, slug: SZ },
  { input: 'Tem plano que dê para ver no telemóvel?', expected: INTENTS.VENDA, slug: SZ },
];

console.log('\n📋 Intent detection v2 (BUG-074)\n');

for (const { input, expected, slug } of testCases) {
  test(JSON.stringify(input), () => {
    const { intent } = detectIntent({ text: input, clientSlug: slug });
    assert(intent === expected, `esperado ${expected}, obtido ${intent}`);
  });
}

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
