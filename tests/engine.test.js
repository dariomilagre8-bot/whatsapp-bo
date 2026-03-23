// tests/engine.test.js

const config = require('../clients/streamzone/config');
const StateMachine = require('../engine/lib/state-machine');
const { findMatch } = require('../engine/lib/matcher');
const { validate } = require('../engine/lib/validator');
const { handlers } = require('../engine/lib/handlers');
const llm = require('../engine/lib/llm');
const { extractName } = require('../src/utils/name-extractor');

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

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ════════════════════════════════════════
console.log('\n🧪 TESTES DO PALANCA BOT ENGINE\n');

// ── MATCHER ──
console.log('📋 Matcher (respostas fixas):');

test('Saudação: "oi"', () => {
  const m = findMatch('oi', config.fixedResponses, 'inicio');
  assert(m && m.id === 'saudacao', `got ${m?.id}`);
});

test('Saudação: "Bom dia"', () => {
  const m = findMatch('Bom dia', config.fixedResponses, 'inicio');
  assert(m && m.id === 'saudacao', `got ${m?.id}`);
});

test('Saudação: "Boa tarde!"', () => {
  const m = findMatch('Boa tarde!', config.fixedResponses, 'inicio');
  assert(m && m.id === 'saudacao', `got ${m?.id}`);
});

test('Despedida: "obrigado"', () => {
  const m = findMatch('obrigado', config.fixedResponses, 'menu');
  assert(m && m.id === 'despedida', `got ${m?.id}`);
});

test('Quero Netflix Individual', () => {
  const m = findMatch('quero netflix individual', config.fixedResponses, 'menu');
  assert(m && m.id === 'compra_netflix_individual', `got ${m?.id}`);
});

test('Quero Prime Video', () => {
  const m = findMatch('quero prime', config.fixedResponses, 'menu');
  assert(m && m.id === 'quero_prime', `got ${m?.id}`);
});

test('"Netflix" sozinho', () => {
  const m = findMatch('Netflix', config.fixedResponses, 'menu');
  assert(m && m.id === 'quero_netflix', `got ${m?.id}`);
});

test('"prime video" sozinho', () => {
  const m = findMatch('prime video', config.fixedResponses, 'menu');
  assert(m && m.id === 'quero_prime', `got ${m?.id}`);
});

test('Selecção Individual no step escolha_plano', () => {
  const m = findMatch('individual', config.fixedResponses, 'escolha_plano');
  assert(m && m.id === 'selecao_individual', `got ${m?.id}`);
});

test('Selecção "1" no step escolha_plano', () => {
  const m = findMatch('1', config.fixedResponses, 'escolha_plano');
  assert(m && m.id === 'selecao_individual', `got ${m?.id}`);
});

test('Selecção "família" no step escolha_plano', () => {
  const m = findMatch('família', config.fixedResponses, 'escolha_plano');
  assert(m && m.id === 'selecao_familia', `got ${m?.id}`);
});

test('Selecção "1" NÃO faz match fora de escolha_plano', () => {
  const m = findMatch('1', config.fixedResponses, 'menu');
  assert(!m || m.id !== 'selecao_individual', `should not match selecao_individual in menu, got ${m?.id}`);
});

test('Preços geral', () => {
  const m = findMatch('quanto custa', config.fixedResponses, 'menu');
  assert(m && m.id === 'precos_geral', `got ${m?.id}`);
});

test('Preços Netflix', () => {
  const m = findMatch('preço da netflix', config.fixedResponses, 'menu');
  assert(m && m.id === 'precos_netflix', `got ${m?.id}`);
});

test('Como funciona', () => {
  const m = findMatch('como funciona', config.fixedResponses, 'menu');
  assert(m && m.id === 'como_funciona', `got ${m?.id}`);
});

test('Dispositivos', () => {
  const m = findMatch('funciona em smart tv', config.fixedResponses, 'menu');
  assert(m && m.id === 'dispositivos', `got ${m?.id}`);
});

test('Pagamento', () => {
  const m = findMatch('como pago', config.fixedResponses, 'menu');
  assert(m && m.id === 'pagamento', `got ${m?.id}`);
});

test('"pode guardar" não dá resposta fixa (tratado pelo interceptor do webhook)', () => {
  const m = findMatch('pode guardar', config.fixedResponses, 'menu');
  assert(m === null || m.action !== 'fixed', '"pode guardar" não deve ter resposta fixa');
});

test('Senha errada', () => {
  const m = findMatch('a senha não funciona', config.fixedResponses, 'menu');
  assert(m && m.id === 'senha_errada', `got ${m?.id}`);
});

test('Confiança: "é golpe"', () => {
  const m = findMatch('isso é golpe', config.fixedResponses, 'menu');
  assert(m && m.id === 'confianca', `got ${m?.id}`);
});

test('Falar humano', () => {
  const m = findMatch('quero falar com alguém', config.fixedResponses, 'menu');
  assert(m && m.id === 'falar_humano', `got ${m?.id}`);
});

test('"sim" genérico', () => {
  const m = findMatch('sim', config.fixedResponses, 'menu');
  assert(m && m.id === 'sim', `got ${m?.id}`);
});

test('"não" genérico', () => {
  const m = findMatch('não', config.fixedResponses, 'menu');
  assert(m && m.id === 'nao', `got ${m?.id}`);
});

test('Reembolso', () => {
  const m = findMatch('quero reembolso', config.fixedResponses, 'menu');
  assert(m && m.id === 'reembolso', `got ${m?.id}`);
});

test('Download offline', () => {
  const m = findMatch('posso descarregar filmes', config.fixedResponses, 'menu');
  assert(m && m.id === 'download_offline', `got ${m?.id}`);
});

test('Quero ambos', () => {
  const m = findMatch('quero os dois', config.fixedResponses, 'menu');
  assert(m && m.id === 'quero_ambos', `got ${m?.id}`);
});

// ── FALSOS POSITIVOS ──
console.log('\n📋 Falsos positivos (NÃO deve fazer match errado):');

test('"N sei" NÃO é despedida', () => {
  const m = findMatch('N sei', config.fixedResponses, 'menu');
  assert(!m || m.id !== 'despedida', `got ${m?.id}`);
});

test('"Como assim meu pedido" NÃO é como_funciona', () => {
  const m = findMatch('Como assim meu pedido', config.fixedResponses, 'menu');
  assert(!m || m.id !== 'como_funciona', `matched como_funciona incorrectly, got ${m?.id}`);
});

// ── VALIDATOR ──
console.log('\n📋 Validator (anti-alucinação):');

test('Bloqueia email', () => {
  const r = validate('envie para teste@gmail.com', config);
  assert(!r.valid, 'should block email');
});

test('Bloqueia preço inventado', () => {
  const r = validate('O plano custa 7000 Kz', config);
  assert(!r.valid, 'should block invented price');
});

test('Permite preço oficial', () => {
  const r = validate('O plano custa 5000 Kz', config);
  assert(r.valid, 'should allow official price');
});

test('Bloqueia termos internos', () => {
  const r = validate('Usamos evolution api', config);
  assert(!r.valid, 'should block internal term');
});

test('Bloqueia confirmação de pagamento', () => {
  const r = validate('O seu pagamento foi confirmado', config);
  assert(!r.valid, 'should block payment confirmation');
});

test('Bloqueia admitir ser bot', () => {
  const r = validate('Sou um bot de inteligência artificial', config);
  assert(!r.valid, 'should block bot admission');
});

test('Bloqueia comando #humano', () => {
  const r = validate('Vou passar #humano', config);
  assert(!r.valid, 'should block #humano');
});

test('Bloqueia resposta muito longa', () => {
  const longText = 'a'.repeat(501);
  const r = validate(longText, config);
  assert(!r.valid, 'should block long response');
});

test('Permite resposta normal', () => {
  const r = validate('Olá! Em que posso ajudá-lo?', config);
  assert(r.valid, 'should allow normal response');
});

// ── HANDLERS ──
console.log('\n📋 Handlers (lógica de negócio):');

const mockStock = { 'Netflix': 0, 'Prime Video': 5 };
const mockStockBoth = { 'Netflix': 3, 'Prime Video': 5 };

test('Greeting inclui nome e preços', () => {
  const session = { name: 'Don', state: 'inicio' };
  const result = handlers.greeting(session, config, mockStockBoth);
  assert(result.response.includes('Don'), 'should include name');
  assert(
    result.response.includes('5.000') || result.response.includes('5,000') || result.response.includes('5000'),
    'should include Netflix price'
  );
  assert(result.nextState === 'menu', 'should transition to menu');
});

test('Greeting retornante sem data_expiracao: tabela de preços', () => {
  const session = { name: 'Maria', state: 'inicio' };
  const result = handlers.greeting(session, config, mockStockBoth, { customerName: 'Maria', isReturningCustomer: true, lastSale: null });
  assert(result.response.includes('Maria'), 'should include name');
  assert(result.response.includes('5.000') || result.response.includes('5000'), 'should include prices (treated as new)');
});

test('Greeting retornante diasRestantes > 7: bem-vindo sem renovação', () => {
  const future = new Date();
  future.setDate(future.getDate() + 10);
  const session = { name: 'João', state: 'inicio' };
  const result = handlers.greeting(session, config, mockStockBoth, {
    customerName: 'João',
    isReturningCustomer: true,
    lastSale: { data_expiracao: future.toISOString().slice(0, 10), plataforma: 'Netflix', plano: 'Individual' },
  });
  assert(result.response.includes('bem-vindo(a) de volta'), 'should welcome back');
  assert(!result.response.includes('expira') && !result.response.includes('renovar'), 'should not mention renewal');
});

test('Greeting retornante diasRestantes <= 7: propõe renovação', () => {
  const future = new Date();
  future.setDate(future.getDate() + 3);
  const session = { name: 'Ana', state: 'inicio' };
  const result = handlers.greeting(session, config, mockStockBoth, {
    customerName: 'Ana',
    isReturningCustomer: true,
    lastSale: { data_expiracao: future.toISOString().slice(0, 10), plataforma: 'Prime Video', plano: 'Partilhado' },
  });
  assert(result.response.includes('Ana'), 'should include name');
  assert(result.response.includes('expira') && result.response.includes('dia(s)') && result.response.includes('renovar'), 'should propose renewal');
});

test('Greeting retornante expirado: propõe renovar plano', () => {
  const past = new Date();
  past.setDate(past.getDate() - 2);
  const session = { name: 'Carlos', state: 'inicio' };
  const result = handlers.greeting(session, config, mockStockBoth, {
    customerName: 'Carlos',
    isReturningCustomer: true,
    lastSale: { data_expiracao: past.toISOString().slice(0, 10), plataforma: 'Netflix', plano: 'Família' },
  });
  assert(result.response.includes('acesso expirou') && result.response.includes('renovar'), 'should say expired and offer renewal');
});

test('buildDynamicPrompt com diasRestantes > 7 inclui "NÃO mencionar renovação"', () => {
  const prompt = llm.buildDynamicPrompt('', 'Ana', true, { counts: null, erro: null }, {}, 15, config);
  assert(prompt.includes('NÃO mencionar renovação'), 'diasRestantes > 7 deve suprimir renovação');
});

test('buildDynamicPrompt com diasRestantes <= 7 inclui "Propor renovação"', () => {
  const prompt2 = llm.buildDynamicPrompt('', 'Ana', true, { counts: null, erro: null }, {}, 5, config);
  assert(prompt2.includes('Propor renovação'), 'diasRestantes <= 7 deve propor renovação');
});

test('buildDynamicPrompt com diasRestantes <= 0 inclui "imediatamente"', () => {
  const prompt3 = llm.buildDynamicPrompt('', 'Ana', true, { counts: null, erro: null }, {}, -1, config);
  assert(prompt3.includes('imediatamente'), 'diasRestantes <= 0 deve propor renovação imediata');
});

test('Cross-sell quando Netflix esgotada', () => {
  const session = { name: 'Don', state: 'menu' };
  const result = handlers.want_platform(session, config, mockStock, { platform: 'Netflix' });
  assert(result.response.includes('esgotado'), 'should mention out of stock');
  assert(result.response.includes('Prime'), 'should offer Prime');
});

test('Direct purchase com stock', () => {
  const session = { name: 'Don', state: 'menu', platform: null, plan: null };
  const result = handlers.direct_purchase(session, config, mockStockBoth, { platform: 'Netflix', plan: 'Individual' });
  assert(result.response.includes('IBAN'), 'should include IBAN');
  assert(result.nextState === 'aguardando_comprovativo', 'should go to aguardando_comprovativo');
  assert(session.platform === 'Netflix', 'should set platform');
  assert(session.plan === 'Individual', 'should set plan');
});

test('Direct purchase sem stock faz cross-sell', () => {
  const session = { name: 'Don', state: 'menu', platform: null, plan: null };
  const result = handlers.direct_purchase(session, config, mockStock, { platform: 'Netflix', plan: 'Individual' });
  assert(result.response.includes('esgotado'), 'should mention esgotado');
  assert(result.response.includes('Prime'), 'should offer Prime');
});

test('Select plan com plataforma definida', () => {
  const session = { name: 'Don', state: 'escolha_plano', platform: 'Prime Video', plan: null };
  const result = handlers.select_plan(session, config, mockStock, { plan: 'Partilhado' });
  assert(
    result.response.includes('5.500') || result.response.includes('5,500') || result.response.includes('5500'),
    'should include Partilhado price'
  );
  assert(result.response.includes('IBAN'), 'should include IBAN');
  assert(result.nextState === 'aguardando_comprovativo', 'should go to aguardando_comprovativo');
});

test('Select plan sem plataforma redireciona', () => {
  const session = { name: 'Don', state: 'escolha_plano', platform: null };
  const result = handlers.select_plan(session, config, mockStock, { plan: 'Individual' });
  assert(result.response.includes('Netflix ou Prime'), 'should ask for platform');
});

// ── NAME EXTRACTOR ──
console.log('\n📋 Name Extractor:');

test('Extrai primeiro nome', () => {
  assert(extractName('Don Milagre') === 'Don', 'should extract Don');
});

test('Remove emojis', () => {
  assert(extractName('🇦🇴 João') === 'João', 'should remove flag emoji');
});

test('Fallback para nome curto', () => {
  assert(extractName('X') === null, 'should return null for short name');
});

test('Fallback para vazio', () => {
  assert(extractName('') === null, 'should return null for empty');
});

// ── STATE MACHINE ──
console.log('\n📋 State Machine:');

const sm = new StateMachine(config);

test('Sessão inicial é "inicio"', () => {
  const s = sm.getSession('test1');
  assert(s.state === 'inicio', `got ${s.state}`);
});

test('Transição válida: inicio → menu', () => {
  const ok = sm.setState('test1', 'menu');
  assert(ok, 'should allow');
  assert(sm.getSession('test1').state === 'menu', 'should be menu');
});

test('Transição válida: menu → escolha_plano', () => {
  const ok = sm.setState('test1', 'escolha_plano');
  assert(ok, 'should allow');
});

test('Transição inválida → safety net menu', () => {
  const s2 = sm.getSession('test2');
  s2.state = 'escolha_plano';
  sm.setState('test2', 'inicio'); // transição inválida
  assert(sm.getSession('test2').state === 'menu', 'should safety net to menu');
});

test('Reset funciona', () => {
  sm.resetSession('test1');
  assert(sm.getSession('test1').state === 'inicio', 'should be inicio after reset');
});

// ══════════════════════════════════
console.log(`\n${'═'.repeat(40)}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);
console.log(`${'═'.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
