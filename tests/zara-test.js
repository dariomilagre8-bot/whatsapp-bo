/**
 * Testes automáticos Zara — respostas fixas, termos proibidos, preços, prompt, escalação
 * Executar: node tests/zara-test.js  ou  npm test
 */
const path = require('path');
const fs = require('fs');
const {
  verificarRespostaFixa,
  getCategoriaRespostaFixa,
  getRespostaPrecosSeSemPlano,
  CATEGORIAS,
  CATEGORIAS_ESCALAR_URGENTE,
  CATEGORIAS_ESCALAR_NORMAL,
  CATEGORIAS_PAUSAR_BOT,
} = require('../src/respostas-fixas');
const { memoriaLocal } = require('../src/memoria-local');

const TERMOS_PROIBIDOS = [
  'checkout', 'subscription', 'trial', 'premium tier', 'account sharing',
  'dashboard', 'admin', 'credentials', '[NOME]', '[PLANO]',
  'Google Sheets', 'Supabase', 'OTP', 'dual-write', 'backend', 'API', 'planilha',
];
const PRECOS_ESPERADOS = ['5.000', '9.000', '13.500', '3.000', '5.500', '8.000'];
const DISPOSITIVOS_ESPERADOS = ['1 dispositivo', '2 dispositivos', '3 dispositivos'];
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

// ─── A. RESPOSTAS FIXAS — cada trigger → categoria correcta ───
console.log('\n--- A. Respostas fixas (triggers → categoria) ---');
const triggersPorCategoria = {};
for (const cat of CATEGORIAS) {
  for (const t of cat.triggers) {
    triggersPorCategoria[t] = cat.id;
  }
}
for (const [msg, catEsperada] of Object.entries(triggersPorCategoria)) {
  const r = verificarRespostaFixa(msg);
  ok(`"${msg}" → ${catEsperada}`, r.match && r.categoria === catEsperada, `got ${r.categoria}`);
}

// ─── B. TERMOS PROIBIDOS ───
console.log('\n--- B. Termos proibidos ---');
const todasRespostas = CATEGORIAS.map(c => c.resposta).join(' ');
for (const termo of TERMOS_PROIBIDOS) {
  ok(`sem "${termo}"`, !todasRespostas.toLowerCase().includes(termo.toLowerCase()), `encontrado: ${termo}`);
}

// ─── B1. Nenhuma resposta fixa contém #humano ou instrução de comando ───
const proibidosCliente = ['#humano', 'escreve humano', 'usa o comando'];
for (const termo of proibidosCliente) {
  ok(`respostas sem "${termo}"`, !todasRespostas.toLowerCase().includes(termo.toLowerCase()), `encontrado: ${termo}`);
}

// ─── B2. Tratamento formal — sem "Queres", "Diz-me", "te interessa" ───
const informais = ['queres', 'diz-me', 'te interessa'];
for (const termo of informais) {
  ok(`respostas formais (sem "${termo}")`, !todasRespostas.toLowerCase().includes(termo), `encontrado: ${termo}`);
}

// ─── B3. Categoria reserva ───
ok('"guardar perfil" → reserva', getCategoriaRespostaFixa('guardar perfil') === 'reserva', '');
ok('"reservar" → reserva', getCategoriaRespostaFixa('reservar') === 'reserva', '');

// ─── B4. Nenhuma resposta fixa contém "preferes" (tratamento formal) ───
ok('respostas sem "preferes"', !todasRespostas.toLowerCase().includes('preferes'), 'encontrado: preferes');

// ─── B5. Comprar sem plano → resposta de preços (não pagamento) ───
const overrideNetflix = getRespostaPrecosSeSemPlano('quero netflix', {});
ok('"quero netflix" sem plano → precos_netflix', overrideNetflix && overrideNetflix.categoria === 'precos_netflix', overrideNetflix ? `got ${overrideNetflix.categoria}` : 'null');
const overridePrime = getRespostaPrecosSeSemPlano('quero prime', {});
ok('"quero prime" sem plano → precos_prime', overridePrime && overridePrime.categoria === 'precos_prime', overridePrime ? `got ${overridePrime.categoria}` : 'null');
const noOverride = getRespostaPrecosSeSemPlano('quero netflix', { plano: 'individual' });
ok('"quero netflix" com plano → sem override', noOverride === null, noOverride ? 'expected null' : '');

// ─── C. QUALIDADE — ≤500 chars, ≤5 frases, terminam com ? (quando for pergunta) ───
console.log('\n--- C. Qualidade ---');
for (const cat of CATEGORIAS) {
  const r = cat.resposta;
  ok(`${cat.id} ≤500 chars`, r.length <= 500, `length ${r.length}`);
  ok(`${cat.id} existe`, r.length > 0, 'vazia');
  const semDecimais = r.replace(/\d\.\d/g, ' '); // ignora pontos em 5.000, 3.000
  const numFrases = (semDecimais.match(/[.!?]/g) || []).length || 1;
  ok(`${cat.id} ≤5 frases`, numFrases <= 5, `frases ${numFrases}`);
}

// ─── D. PREÇOS CORRECTOS ───
console.log('\n--- D. Preços ---');
const respostasPreco = CATEGORIAS.filter(c =>
  ['precos_netflix', 'precos_prime', 'precos_geral'].includes(c.id)
).map(c => c.resposta);
const textoPrecos = respostasPreco.join(' ');
for (const valor of PRECOS_ESPERADOS) {
  ok(`contém ${valor}`, textoPrecos.includes(valor), `valor ${valor} não encontrado`);
}

// ─── E. DISPOSITIVOS ───
console.log('\n--- E. Dispositivos ---');
const respostasComDispositivos = CATEGORIAS.filter(c =>
  ['precos_netflix', 'precos_prime', 'dispositivos'].includes(c.id)
).map(c => c.resposta);
const textoDisp = respostasComDispositivos.join(' ');
for (const d of DISPOSITIVOS_ESPERADOS) {
  ok(`contém "${d}"`, textoDisp.includes(d), `não encontrado: ${d}`);
}

// ─── F. SYSTEM PROMPT — zara-base.txt ───
console.log('\n--- F. System prompt (zara-base.txt) ---');
const promptPath = path.join(__dirname, '..', 'prompts', 'zara-base.txt');
const existe = fs.existsSync(promptPath);
ok('zara-base.txt existe', existe, 'ficheiro não encontrado');
if (existe) {
  const conteudo = fs.readFileSync(promptPath, 'utf8');
  ok('tem ANTI-ALUCINAÇÃO', conteudo.includes('ANTI-ALUCINAÇÃO'), '');
  ok('tem ESTRITAMENTE PROIBIDO', conteudo.includes('ESTRITAMENTE PROIBIDO'), '');
  ok('tem código de verificação', conteudo.includes('código de verificação'), '');
  ok('tem RESOLUÇÃO DE RECLAMAÇÕES', conteudo.includes('RESOLUÇÃO DE RECLAMAÇÕES'), '');
  ok('tem NUNCA inventar', conteudo.includes('NUNCA inventar'), '');
  ok('tem escalar', conteudo.includes('escalar'), '');
  ok('tem REGRAS DE DISPOSITIVOS', conteudo.includes('REGRAS DE DISPOSITIVOS'), '');
  ok('tem CLIENTE EXISTENTE', conteudo.includes('CLIENTE EXISTENTE'), '');
  ok('tem CLIENTE NOVO', conteudo.includes('CLIENTE NOVO'), '');
  ok('tem PERITA', conteudo.includes('PERITA'), '');
  ok('tem BREVIDADE', conteudo.includes('BREVIDADE'), '');
  ok('prompt NÃO contém "Escreve #humano"', !conteudo.includes('Escreve #humano'), '');
  ok('prompt NÃO contém "escreve HUMANO"', !conteudo.toLowerCase().includes('escreve humano'), '');
}

// ─── G. SIMULAÇÃO CONVERSA ───
console.log('\n--- G. Simulação conversa ---');
const fluxo = [
  ['oi', 'saudacao'],
  ['netflix', 'precos_netflix'],
  ['quero comprar', 'quero_comprar'],
  ['não funciona', 'problema_conta'],
  ['código', 'codigo_verificacao'],
  ['já paguei', 'paguei_sem_resposta'],
  ['quero o dinheiro de volta', 'reembolso'],
  ['humano', 'falar_humano'],
  ['obrigado', 'despedida'],
];
for (const [msg, catEsperada] of fluxo) {
  const c = getCategoriaRespostaFixa(msg);
  ok(`"${msg}" → ${catEsperada}`, c === catEsperada, `got ${c}`);
}

// ─── H. MEMÓRIA LOCAL ───
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

// ─── I. CATEGORIAS DE ESCALAÇÃO ───
console.log('\n--- I. Categorias de escalação ---');
const escalarEsperadas = ['codigo_verificacao', 'senha_errada', 'paguei_sem_resposta', 'falar_humano', 'reembolso', 'reserva'];
for (const id of escalarEsperadas) {
  const inUrgent = CATEGORIAS_ESCALAR_URGENTE.includes(id);
  const inNormal = CATEGORIAS_ESCALAR_NORMAL.includes(id);
  ok(`categoria "${id}" existe para escalação`, inUrgent || inNormal, 'não está em URGENTE nem NORMAL');
}
ok('CATEGORIAS_ESCALAR_URGENTE tem 3', CATEGORIAS_ESCALAR_URGENTE.length === 3, `got ${CATEGORIAS_ESCALAR_URGENTE.length}`);
ok('CATEGORIAS_PAUSAR_BOT inclui codigo_verificacao e senha_errada',
  CATEGORIAS_PAUSAR_BOT.includes('codigo_verificacao') && CATEGORIAS_PAUSAR_BOT.includes('senha_errada'), '');

// ─── J. VALIDAR RESPOSTA (validarRespostaZara) ───
console.log('\n--- J. Validar resposta Zara ---');
const { validarRespostaZara, MSG_PRECO_INVALIDO } = require('../src/validar-resposta');
ok('senha: abc123 → inválido', !validarRespostaZara('A senha: abc123 está errada').valido, '');
ok('dashboard → inválido', !validarRespostaZara('Consulta o dashboard').valido, '');
ok('Olá! Como posso ajudar? → válido', validarRespostaZara('Olá! Como posso ajudar?').valido, '');
ok('[NOME] → inválido', !validarRespostaZara('Olá [NOME]!').valido, '');
ok('netfixxxdabanda bloqueado', !validarRespostaZara('Email: netfixxxdabanda1@gmail.com').valido, '');
const valPreco = validarRespostaZara('O plano custa 9999 Kz por mês.');
ok('preço Kz inventado (9999) → inválido', !valPreco.valido && valPreco.substituir === MSG_PRECO_INVALIDO, '');

// ─── K. CLIENTE LOOKUP — funções existem e exportam ───
console.log('\n--- K. Cliente lookup ---');
const clienteLookup = require('../src/cliente-lookup');
ok('buscarClientePorWhatsapp é função', typeof clienteLookup.buscarClientePorWhatsapp === 'function', '');
ok('buscarVendasDoCliente é função', typeof clienteLookup.buscarVendasDoCliente === 'function', '');
ok('verificarStock é função', typeof clienteLookup.verificarStock === 'function', '');
ok('buscarPerfisDoCliente é função', typeof clienteLookup.buscarPerfisDoCliente === 'function', '');

// ─── L. COMANDOS SUPERVISOR — #pausar, #retomar, #status, #stock, #cliente, #ajuda no código ───
console.log('\n--- L. Comandos supervisor ---');
const webhookSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'webhook.js'), 'utf8');
ok('webhook trata #pausar', webhookSrc.includes('#pausar'), '');
ok('webhook trata #retomar', webhookSrc.includes('#retomar'), '');
ok('webhook trata #status', webhookSrc.includes('#status'), '');
ok('webhook trata #stock', webhookSrc.includes('#stock') && webhookSrc.includes('STOCK STREAMZONE'), '');
ok('webhook trata #cliente', webhookSrc.includes('#cliente') && webhookSrc.includes('CLIENTE:'), '');
ok('webhook trata #ajuda', webhookSrc.includes('#ajuda'), '');

// TTL expira (após 1s)
setTimeout(() => {
  const expirou = memoriaLocal.get(keyTtl) === null;
  ok('TTL expira (após 1s)', expirou, 'ainda tem valor');
  memoriaLocal.del(keyTtl);
  console.log('\n' + (falhas === 0 ? '✅ Todos os testes passaram.' : `❌ ${falhas} falha(s).`));
  process.exit(falhas > 0 ? 1 : 0);
}, 1100);
