// tests/engine/safe-guard.test.js — Safe Guard: anti-alucinação + filtro de emojis

const { isSafeResponse, removeEmojis } = require('../../engine/lib/safe-guard');

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

// ─── isSafeResponse ───────────────────────────────────────────────────────────

console.log('\n🛡️  Safe Guard — Anti-alucinação:');

test('bloqueia "não temos planos disponíveis"', () => {
  assert(!isSafeResponse('De momento não temos planos disponíveis'), 'deve bloquear');
});

test('bloqueia "não temos vagas disponíveis"', () => {
  assert(!isSafeResponse('Infelizmente não temos vagas disponíveis de momento.'), 'deve bloquear');
});

test('bloqueia "não oferecemos"', () => {
  assert(!isSafeResponse('Não oferecemos esse serviço no momento.'), 'deve bloquear');
});

test('bloqueia "infelizmente não há"', () => {
  assert(!isSafeResponse('Infelizmente não há planos para o momento.'), 'deve bloquear');
});

test('bloqueia "de momento não temos"', () => {
  assert(!isSafeResponse('De momento não temos esse plano disponível.'), 'deve bloquear');
});

test('bloqueia "não possuímos"', () => {
  assert(!isSafeResponse('Não possuímos esse serviço.'), 'deve bloquear');
});

test('permite saudação normal', () => {
  assert(isSafeResponse('Olá! Seja bem-vindo à StreamZone Connect.'), 'deve permitir');
});

test('permite escalação para supervisor', () => {
  assert(isSafeResponse('Vou encaminhar ao nosso responsável para garantir a melhor resposta.'), 'deve permitir');
});

test('permite preço normal', () => {
  assert(isSafeResponse('O plano Individual Netflix custa 5.000 Kz por mês.'), 'deve permitir');
});

test('permite resposta de comprovativo', () => {
  assert(isSafeResponse('Recebi o seu comprovativo! Vou encaminhar ao supervisor para validação.'), 'deve permitir');
});

test('permite texto vazio (não bloqueia)', () => {
  assert(isSafeResponse(''), 'texto vazio é seguro');
});

// ─── removeEmojis ─────────────────────────────────────────────────────────────

console.log('\n😶 Emoji Filter:');

test('remove emoji simples', () => {
  const result = removeEmojis('Olá! 😊 Bem-vindo!');
  assert(!result.includes('😊'), 'emoji deve ser removido');
  assert(result.includes('Olá!'), 'texto deve permanecer');
  assert(result.includes('Bem-vindo!'), 'texto deve permanecer');
});

test('remove múltiplos emojis', () => {
  const result = removeEmojis('Excelente! 🎉🎊 Parabéns! 👏');
  assert(!/[\u{1F300}-\u{1F9FF}]/u.test(result), 'emojis devem ser removidos');
  assert(result.includes('Excelente!'), 'texto deve permanecer');
  assert(result.includes('Parabéns!'), 'texto deve permanecer');
});

test('mantém texto sem emojis intacto', () => {
  const input = 'Olá! Bem-vindo à StreamZone Connect.';
  assert(removeEmojis(input) === input, 'deve permanecer idêntico');
});

test('remove emoji de bandeira', () => {
  const result = removeEmojis('Aceitamos pagamento em Kz 🇦🇴');
  assert(!result.includes('🇦🇴'), 'bandeira deve ser removida');
  assert(result.includes('Kz'), 'texto deve permanecer');
});

test('remove emojis de objectos', () => {
  const result = removeEmojis('Activo imediatamente! ⚡ Pagamento via 🏦 transferência.');
  assert(!result.includes('⚡'), 'raio deve ser removido');
  assert(!result.includes('🏦'), 'banco deve ser removido');
  assert(result.includes('transferência'), 'texto deve permanecer');
});

test('não falha com string vazia', () => {
  assert(removeEmojis('') === '', 'string vazia permanece vazia');
});

// ─── Resultado ────────────────────────────────────────────────────────────────

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
