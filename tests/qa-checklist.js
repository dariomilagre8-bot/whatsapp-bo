// tests/qa-checklist.js — Script de testes QA manuais para o bot Zara (StreamZone)
// Executar: node tests/qa-checklist.js
// Valida detecção de localização, reclamações, rate limit, extractPhoneNumber, etc.

const { detectarReclamacao, detectarLocalizacao, gerarRespostaLocalizacao } = require('../src/crm/complaints');
const { extractPhoneNumber } = require('../src/utils/phone');

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

console.log('\n🧪 QA CHECKLIST — TESTES AUTOMATIZADOS\n');

// ═══════════════════════════════════════════════════
console.log('📋 1. extractPhoneNumber (Bug 1):');
// ═══════════════════════════════════════════════════

test('JID normal @s.whatsapp.net', () => {
  assert(extractPhoneNumber('244941713216@s.whatsapp.net') === '244941713216');
});

test('JID @lid sem 244 embutido → devolvido tal como está + warning nos logs', () => {
  const result = extractPhoneNumber('251371634868240');
  assert(typeof result === 'string' && result.length > 0, `Deveria devolver algo, recebeu: "${result}"`);
});

test('JID @lid COM 244 embutido → extrai correctamente', () => {
  const result = extractPhoneNumber('9999244941713216');
  assert(result === '244941713216', `Esperado 244941713216, recebeu: ${result}`);
});

test('Número angolano 12 dígitos passthrough', () => {
  assert(extractPhoneNumber('244941713216') === '244941713216');
});

test('Número local 9 dígitos → prefixar 244', () => {
  assert(extractPhoneNumber('941713216') === '244941713216');
});

test('String vazia → string vazia', () => {
  assert(extractPhoneNumber('') === '');
});

test('Null → string vazia', () => {
  assert(extractPhoneNumber(null) === '');
});

// ═══════════════════════════════════════════════════
console.log('\n📋 2. Detecção de localização/Household (Bug pós-venda):');
// ═══════════════════════════════════════════════════

test('"erro de localização" → localização', () => {
  assert(detectarLocalizacao('Tenho um erro de localização na Netflix'));
});

test('"a sua TV não faz parte deste agregado" → localização', () => {
  assert(detectarLocalizacao('Aparece que a sua TV não faz parte deste agregado'));
});

test('"household" → localização', () => {
  assert(detectarLocalizacao('Dá um erro de household'));
});

test('"actualizar localização" → localização', () => {
  assert(detectarLocalizacao('Tenho que actualizar localização'));
});

test('"atualizar localização da Netflix" → localização', () => {
  assert(detectarLocalizacao('Como atualizar localização da Netflix?'));
});

test('"mudei de casa" → localização', () => {
  assert(detectarLocalizacao('Mudei de casa e agora não funciona'));
});

test('"na casa do meu amigo" → localização', () => {
  assert(detectarLocalizacao('Estou na casa do meu amigo e dá erro'));
});

test('"usar noutro local" → localização', () => {
  assert(detectarLocalizacao('Quero usar em outro lugar'));
});

test('"usar noutra tv" → localização', () => {
  assert(detectarLocalizacao('Posso usar noutra casa?'));
});

test('"tv de outro quarto" → localização', () => {
  assert(detectarLocalizacao('Na tv de outro quarto dá erro'));
});

test('Localização NÃO é reclamação grave', () => {
  assert(!detectarReclamacao('Tenho um erro de localização na Netflix'));
});

test('Localização NÃO é reclamação grave (household)', () => {
  assert(!detectarReclamacao('Aparece household na Netflix'));
});

// ═══════════════════════════════════════════════════
console.log('\n📋 3. Detecção de reclamações graves (escalar ao supervisor):');
// ═══════════════════════════════════════════════════

test('"senha errada" → reclamação grave', () => {
  assert(detectarReclamacao('A senha está errada'));
});

test('"não consigo entrar" → reclamação grave', () => {
  assert(detectarReclamacao('Não consigo entrar na conta'));
});

test('"conta bloqueada" → reclamação grave', () => {
  assert(detectarReclamacao('A minha conta está bloqueada'));
});

test('"mudaram a minha senha" → reclamação grave', () => {
  assert(detectarReclamacao('Mudaram a minha senha'));
});

test('"paguei e não activaram" → reclamação grave', () => {
  assert(detectarReclamacao('Paguei e não activaram a minha conta'));
});

test('"serviço parou" → reclamação grave', () => {
  assert(detectarReclamacao('O serviço parou de funcionar'));
});

// ═══════════════════════════════════════════════════
console.log('\n📋 4. Resposta auto-ajuda localização:');
// ═══════════════════════════════════════════════════

test('Resposta contém passos de resolução', () => {
  const resp = gerarRespostaLocalizacao('Don');
  assert(resp.includes('Don'), 'Deve incluir nome do cliente');
  assert(resp.includes('Passo 1'), 'Deve ter Passo 1');
  assert(resp.includes('Passo 2'), 'Deve ter Passo 2');
  assert(resp.includes('Passo 3'), 'Deve ter Passo 3');
  assert(resp.includes('Alternativa'), 'Deve ter alternativa');
  assert(resp.includes('persistir'), 'Deve mencionar escalação se persistir');
});

// ═══════════════════════════════════════════════════
console.log('\n📋 5. Separação: Localização vs Reclamação:');
// ═══════════════════════════════════════════════════

test('"quero cancelar" NÃO é localização nem reclamação', () => {
  assert(!detectarLocalizacao('quero cancelar a minha conta'));
  assert(!detectarReclamacao('quero cancelar a minha conta'));
});

test('"quero renovar" NÃO é nenhuma das duas', () => {
  assert(!detectarLocalizacao('quero renovar'));
  assert(!detectarReclamacao('quero renovar'));
});

test('"olá bom dia" NÃO é nenhuma das duas', () => {
  assert(!detectarLocalizacao('olá bom dia'));
  assert(!detectarReclamacao('olá bom dia'));
});

test('"quero Netflix individual" NÃO é nenhuma das duas', () => {
  assert(!detectarLocalizacao('quero Netflix individual'));
  assert(!detectarReclamacao('quero Netflix individual'));
});

// ═══════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);
console.log('═'.repeat(50));

console.log(`
╔════════════════════════════════════════════════════════════════╗
║            TESTES MANUAIS — PRÓXIMA RONDA QA                  ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  CENÁRIO A: ERRO DE LOCALIZAÇÃO (auto-ajuda)                  ║
║  ─────────────────────────────────────────────                 ║
║  A1. Cliente existente manda "Erro de localização Netflix"    ║
║      → Bot responde com 3 passos + alternativa                ║
║      → NÃO pausa sessão, NÃO escala ao supervisor             ║
║      → Supervisor recebe notificação informativa              ║
║                                                                ║
║  A2. Mesmo cliente manda "Já tentei e não funcionou"          ║
║      → Bot escala ao supervisor (locationHelpSent = true)     ║
║      → Sessão pausada                                          ║
║                                                                ║
║  A3. Cliente manda "a minha TV não faz parte deste agregado"  ║
║      → Deve activar handler de localização (auto-ajuda)       ║
║                                                                ║
║  A4. Cliente manda "estou na casa do meu amigo"               ║
║      → Deve activar handler de localização                     ║
║                                                                ║
║  A5. AO FIM DE SEMANA (sábado/domingo): enviar erros          ║
║      → Verificar que o bot responde normalmente               ║
║                                                                ║
║  CENÁRIO B: RECLAMAÇÃO GRAVE (escalar)                        ║
║  ─────────────────────────────────────                         ║
║  B1. "A senha está errada" → escalar + pausar                 ║
║  B2. "Mudaram a minha senha" → escalar + pausar               ║
║  B3. "Paguei e não activaram" → escalar + pausar              ║
║  B4. "A conta está bloqueada" → escalar + pausar              ║
║                                                                ║
║  CENÁRIO C: RENOVAÇÃO (fluxo completo)                        ║
║  ────────────────────────────────────                          ║
║  C1. Cliente expirado manda "olá" → bot diz "expirou, quer    ║
║      renovar?" → cliente responde "Sim" → dados de pagamento  ║
║      → comprovativo → #sim → renovação confirmada             ║
║                                                                ║
║  C2. Cliente expirado manda "quero renovar" directo →         ║
║      NÃO recebe mensagem genérica, vai ao LLM/handler         ║
║                                                                ║
║  CENÁRIO D: CANCELAMENTO                                      ║
║  ───────────────────────                                       ║
║  D1. "Quero cancelar a minha conta" → escalar + motivo        ║
║  D2. "Não quero mais" → escalar                               ║
║  D3. Após cancelar, #retomar funciona                         ║
║                                                                ║
║  CENÁRIO E: COMPROVATIVO DE PAGAMENTO                         ║
║  ────────────────────────────────────                          ║
║  E1. Enviar IMAGEM com pendingSale activo →                   ║
║      "Recebi o comprovativo..." + notifica supervisor          ║
║  E2. Enviar IMAGEM sem pendingSale →                          ║
║      "Recebi a imagem. Em que posso ajudá-lo?" (neutra)       ║
║  E3. Enviar PDF → aceitar como comprovativo                   ║
║  E4. Enviar .docx → "Aceitamos imagem ou PDF"                ║
║                                                                ║
║  CENÁRIO F: NÚMERO TELEFONE (Bug 1)                           ║
║  ──────────────────────────────────                            ║
║  F1. Verificar na planilha: coluna Telefone = 244XXXXXXXXX    ║
║  F2. Notificação ao supervisor mostra número correcto          ║
║  F3. #sim [número] funciona com o número correcto             ║
║                                                                ║
║  CENÁRIO G: LOOP CLIENTE EXISTENTE (Bug 9)                    ║
║  ──────────────────────────────────────────                    ║
║  G1. Cliente activo manda "olá" → saudação com info plano     ║
║  G2. Mesmo cliente manda "quero outro plano" → LLM normal     ║
║  G3. Mesmo cliente manda qualquer coisa → NÃO repete          ║
║      saudação de reconhecimento                                ║
║                                                                ║
║  CENÁRIO H: RATE LIMIT (Bug 8)                                ║
║  ────────────────────────────                                  ║
║  H1. Enviar 5 msgs em 10 seg → só 2 respostas                ║
║  H2. Enviar emoji sozinho → "Olá! Em que posso ajudá-lo?"    ║
║  H3. Esperar 30 seg e enviar outra → responde normal          ║
║                                                                ║
║  CENÁRIO I: COMANDOS SUPERVISOR                               ║
║  ──────────────────────────────                                ║
║  I1. #pausar [número] → pausa                                 ║
║  I2. #retomar [número] → despausa                             ║
║  I3. #status → mostra sessões activas e pausadas              ║
║  I4. #leads → resumo CRM (ou msg de schema SQL)              ║
║  I5. #waitlist → resumo waitlist (ou msg de schema SQL)       ║
║  I6. #sim incompleto → "Comando incompleto"                  ║
║  I7. #teste on → modo teste activado                          ║
║                                                                ║
║  CENÁRIO J: WAITLIST (Bug 2)                                  ║
║  ──────────────────────────                                    ║
║  J1. Stock esgotado + "quero ser avisado" → cria na tabela    ║
║  J2. Verificar log "[WAITLIST] Criado com sucesso: id=X"     ║
║  J3. Verificar na tabela stock_waitlist no Supabase            ║
║                                                                ║
║  CENÁRIO K: PAGAMENTO 2 MESES (Bug 4)                        ║
║  ────────────────────────────────────                          ║
║  K1. "Quero pagar 2 meses" → valor correcto (2x)             ║
║  K2. #sim → 1 row na planilha, Data_Expiracao = +60 dias     ║
║  K3. Coluna QNTD preenchida (Bug 3)                           ║
║                                                                ║
║  CENÁRIO L: COMPRA NOVA (fluxo normal)                        ║
║  ────────────────────────────────────                          ║
║  L1. "Quero Netflix individual" → preço + dados pagamento     ║
║  L2. Comprovativo → supervisor recebe → #sim → credenciais   ║
║  L3. Planilha: Status=indisponivel, Telefone correcto,        ║
║      QNTD=1, Plano e Valor preenchidos                        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);

process.exit(failed > 0 ? 1 : 0);
