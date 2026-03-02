/**
 * Testes automáticos Zara — respostas fixas, termos proibidos, preços, prompt, webhook
 * Executar: node tests/zara-test.js
 */
const path = require('path');
const fs = require('fs');
const { verificarRespostaFixa, getCategoriaRespostaFixa, CATEGORIAS } = require('../src/respostas-fixas');
const { memoriaLocal } = require('../src/memoria-local');

const TERMOS_PROIBIDOS = [
  'checkout', 'subscription', 'trial', 'premium tier', 'account sharing',
  'dashboard', 'admin', 'credentials', '[NOME]', '[PLANO]',
];
const PRECOS_ESPERADOS = ['5.000', '9.000', '13.500', '3.000', '5.500', '8.000'];
let falhas = 0;

function ok(name, cond, msg) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    return true;
  }
  console.log(`  ❌ ${name}: ${msg || 'falhou'}`);
  falhas++;
  return false;
}

// A. Respostas fixas — triggers fazem match correcto
console.log('\n--- A. Respostas fixas ---');
const triggersTest = [
  ['oi', 'saudacao'],
  ['olá', 'saudacao'],
  ['bom dia', 'saudacao'],
  ['quanto custa netflix', 'precos_netflix'],
  ['planos prime', 'precos_prime'],
  ['preço', 'precos_geral'],
  ['como funciona', 'como_funciona'],
  ['é confiável', 'confianca'],
  ['renovar', 'renovar'],
  ['não funciona', 'problema_conta'],
  ['quero comprar', 'quero_comprar'],
  ['obrigado', 'despedida'],
  ['site', 'site'],
  ['onde compro', 'site'],
  ['humano', 'falar_humano'],
  ['HUMANO', 'falar_humano'],
  ['pessoa', 'falar_humano'],
];
for (const [msg, catEsperada] of triggersTest) {
  const r = verificarRespostaFixa(msg);
  ok(`"${msg}" → ${catEsperada}`, r.match && r.categoria === catEsperada, `got ${r.categoria}`);
}

// B. Termos proibidos
console.log('\n--- B. Termos proibidos ---');
const todasRespostas = CATEGORIAS.map(c => c.resposta).join(' ');
for (const termo of TERMOS_PROIBIDOS) {
  ok(`sem "${termo}"`, !todasRespostas.toLowerCase().includes(termo.toLowerCase()), `encontrado: ${termo}`);
}

// C. Qualidade — ≤500 chars; respostas curtas (listas com bullets contam como várias linhas)
console.log('\n--- C. Qualidade ---');
for (const cat of CATEGORIAS) {
  const r = cat.resposta;
  ok(`${cat.id} ≤500 chars`, r.length <= 500, `length ${r.length}`);
  ok(`${cat.id} existe`, r.length > 0, 'vazia');
}

// D. Preços — respostas de preço contêm valores correctos
console.log('\n--- D. Preços ---');
const respostasPreco = CATEGORIAS.filter(c => ['precos_netflix', 'precos_prime', 'precos_geral'].includes(c.id)).map(c => c.resposta);
const textoPrecos = respostasPreco.join(' ');
for (const valor of PRECOS_ESPERADOS) {
  ok(`contém ${valor}`, textoPrecos.includes(valor), `valor ${valor} não encontrado`);
}

// E. System prompt — zara-base.txt existe e tem secções
console.log('\n--- E. System prompt ---');
const promptPath = path.join(__dirname, '..', 'prompts', 'zara-base.txt');
const existe = fs.existsSync(promptPath);
ok('zara-base.txt existe', existe, 'ficheiro não encontrado');
if (existe) {
  const conteudo = fs.readFileSync(promptPath, 'utf8');
  ok('tem IDENTIDADE', conteudo.includes('IDENTIDADE'), '');
  ok('tem PRODUTOS E PREÇOS', conteudo.includes('PRODUTOS E PREÇOS'), '');
  ok('tem REGRAS ABSOLUTAS', conteudo.includes('REGRAS ABSOLUTAS'), '');
  ok('tem REGRA DE TRANSIÇÃO', conteudo.includes('TRANSIÇÃO'), '');
  ok('tem HUMANO e responsável', conteudo.includes('HUMANO') && conteudo.includes('responsável'), '');
}

// F. Formato webhook — extração de dados do payload Evolution (simulado)
console.log('\n--- F. Formato webhook ---');
const payloadSimulado = {
  event: 'messages.upsert',
  data: {
    key: { remoteJid: '244912345678@s.whatsapp.net', fromMe: false },
    pushName: 'João',
    message: { conversation: 'Olá' },
  },
};
const eventOk = payloadSimulado.event === 'messages.upsert';
const fromMe = payloadSimulado.data?.key?.fromMe === false;
const textMsg = payloadSimulado.data?.message?.conversation || payloadSimulado.data?.message?.extendedTextMessage?.text || '';
ok('event messages.upsert', eventOk, '');
ok('fromMe false', fromMe, '');
ok('texto extraído', textMsg === 'Olá', `got "${textMsg}"`);

// G. Simulação conversa — saudação → netflix → preço → comprar
console.log('\n--- G. Simulação conversa ---');
const fluxo = ['oi', 'netflix', 'quanto custa', 'quero comprar'];
const categoriasFluxo = fluxo.map(m => getCategoriaRespostaFixa(m));
const esperado = ['saudacao', 'precos_netflix', 'precos_geral', 'quero_comprar'];
ok('fluxo saudação→netflix→preço→comprar', categoriasFluxo.every((c, i) => c === esperado[i]), `got ${categoriasFluxo.join(', ')}`);

// H. Memória local — set/get/incr/del, TTL expira
console.log('\n--- H. Memória local ---');
const keyTest = 'test:zara:memoria';
memoriaLocal.del(keyTest);
ok('get inexistente → null', memoriaLocal.get(keyTest) === null, '');
memoriaLocal.set(keyTest, 42, 2);
ok('set/get valor', memoriaLocal.get(keyTest) === 42, '');
memoriaLocal.del(keyTest);
ok('del apaga', memoriaLocal.get(keyTest) === null, '');
memoriaLocal.incr(keyTest + ':incr', 10);
const v1 = memoriaLocal.get(keyTest + ':incr');
memoriaLocal.incr(keyTest + ':incr', 10);
const v2 = memoriaLocal.get(keyTest + ':incr');
ok('incr incrementa', v1 === 1 && v2 === 2, `got ${v1}, ${v2}`);
memoriaLocal.del(keyTest + ':incr');
const keyTtl = 'test:zara:ttl';
memoriaLocal.set(keyTtl, true, 1);
ok('TTL set', memoriaLocal.get(keyTtl) === true, '');
setTimeout(() => {
  const expirou = memoriaLocal.get(keyTtl) === null;
  ok('TTL expira (após 1s)', expirou, 'ainda tem valor');
  memoriaLocal.del(keyTtl);
  runResult();
}, 1100);
function runResult() {
  console.log('\n' + (falhas === 0 ? '✅ Todos os testes passaram.' : `❌ ${falhas} falha(s).`));
  process.exit(falhas > 0 ? 1 : 0);
}
return;
