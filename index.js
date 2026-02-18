require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  cleanNumber, todayDate,
  updateSheetCell, markProfileSold, markProfileAvailable,
  checkClientInSheet, findAvailableProfile, findAvailableProfiles, findClientProfiles,
  hasAnyStock, countAvailableProfiles, appendLostSale,
} = require('./googleSheets');

const app = express();
app.use(express.json());
app.use(cors());

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==================== CONFIGURACOES ====================

// Rota de Integração com o Site (Lovable)
app.post('/api/web-checkout', async (req, res) => {
  try {
    const { nome, whatsapp, plataforma, plano, slots } = req.body;
    const totalSlots = parseInt(slots, 10);
    const pType = PLAN_PROFILE_TYPE[plano.toLowerCase()] || 'shared_profile';

    const profiles = await findAvailableProfiles(plataforma, totalSlots, pType);
    
    if (!profiles || profiles.length < totalSlots) {
      const availableSlots = profiles ? profiles.length : 0;
      const svcInfo = CATALOGO[plataforma.toLowerCase()] || {};
      const pricePerUnit = svcInfo.planos ? (svcInfo.planos[plano.toLowerCase()] || 0) : 0;
      const valorEmRisco = pricePerUnit * parseInt(slots, 10);
      if (MAIN_BOSS) {
        await sendWhatsAppMessage(MAIN_BOSS, `⚠️ STOCK INSUFICIENTE — Ação necessária\n\n📋 Resumo:\n- Cliente (via site): ${nome} / ${whatsapp}\n- Pedido: ${slots}x ${plano} ${plataforma}\n- Slots necessários: ${totalSlots}\n- Slots disponíveis: ${availableSlots}\n- Valor da venda em risco: ${valorEmRisco.toLocaleString('pt')} Kz\n\n🔧 Opções:\n1. Repor stock → responder "reposto ${whatsapp.replace(/\D/g, '')}"\n2. Cancelar → responder "cancelar ${whatsapp.replace(/\D/g, '')}"`);
      }
      return res.status(400).json({ success: false, message: `Sem stock suficiente. Disponível: ${availableSlots}/${totalSlots}` });
    }

    for (const p of profiles) {
      await markProfileSold(p.rowIndex, nome, whatsapp, 1);
    }

    if (MAIN_BOSS) {
      const alerta = `🚀 *VENDA VIA SITE*\n👤 ${nome}\n📱 ${whatsapp}\n📦 ${plataforma} ${plano}\n🔢 ${totalSlots} slots reservados.`;
      await sendWhatsAppMessage(MAIN_BOSS, alerta);
    }

    res.status(200).json({ success: true, message: 'Pedido registado com sucesso!' });
  } catch (error) {
    console.error('Erro no Web Checkout:', error);
    res.status(500).json({ success: false, message: 'Erro no processamento do pedido.' });
  }
});

// multer config para upload de comprovativos (max 5MB)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.post('/api/upload-comprovativo', upload.single('comprovativo'), async (req, res) => {
  try {
    const { nome, whatsapp, plataforma, plano, quantidade, total } = req.body;
    const filename = req.file ? req.file.filename : 'sem ficheiro';

    const SUPERVISOR = (process.env.SUPERVISOR_NUMBER || '').split(',')[0].trim().replace(/\D/g, '');
    if (SUPERVISOR) {
      const msg = `📎 *COMPROVATIVO VIA SITE*\n👤 ${nome}\n📱 ${whatsapp}\n📦 ${quantidade}x ${plano} ${plataforma}\n💰 Total: ${parseInt(total || 0, 10).toLocaleString('pt')} Kz\n📄 Ficheiro: ${filename}\n\nResponda: *sim* ou *nao*`;
      await sendWhatsAppMessage(SUPERVISOR, msg);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro upload comprovativo:', error);
    res.status(500).json({ success: false, message: 'Erro no upload.' });
  }
});

const RAW_SUPERVISORS = (process.env.SUPERVISOR_NUMBER || '').split(',').map(n => n.trim().replace(/\D/g, ''));
const REAL_PHONES = RAW_SUPERVISORS.filter(n => n.length < 15);
const ALL_SUPERVISORS = RAW_SUPERVISORS;
const MAIN_BOSS = REAL_PHONES.length > 0 ? REAL_PHONES[0] : null;

console.log('📱 Telefones Reais:', REAL_PHONES);
console.log('🖥️ Todos os IDs aceites:', ALL_SUPERVISORS);
console.log('👑 Chefe Principal:', MAIN_BOSS);

// ==================== CATALOGO ====================
const CATALOGO = {
  netflix: {
    nome: 'Netflix',
    emoji: '🎬',
    planos: { individual: 5000, partilha: 9000, familia: 13500 }
  },
  prime_video: {
    nome: 'Prime Video',
    emoji: '📺',
    planos: { individual: 3000, partilha: 5500, familia: 8000 }
  }
};

const PLAN_SLOTS = { individual: 1, partilha: 2, familia: 3 };
const PLAN_RANK = { individual: 1, partilha: 2, familia: 3 };

const PAYMENT = {
  titular: 'Braulio Manuel',
  iban: '0040.0000.7685.3192.1018.3',
  multicaixa: '946014060'
};

const PLAN_PROFILE_TYPE = { individual: 'shared_profile', partilha: 'shared_profile', familia: 'shared_profile' };

const SUPPORT_KEYWORDS = [
  'não entra', 'nao entra', 'senha errada', 'ajuda', 'travou',
  'não funciona', 'nao funciona', 'problema', 'erro',
  'não consigo', 'nao consigo', 'não abre', 'nao abre'
];

// ==================== FUNCOES PURAS ====================
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatPriceTable(serviceKey) {
  const svc = CATALOGO[serviceKey];
  if (!svc) return '';
  const lines = [`${svc.emoji} *TABELA ${svc.nome.toUpperCase()}*`];
  if (svc.planos.individual != null) lines.push(`👤 Individual (1 perfil): ${svc.planos.individual.toLocaleString('pt')} Kz`);
  if (svc.planos.partilha != null) lines.push(`👥 Partilha (2 perfis): ${svc.planos.partilha.toLocaleString('pt')} Kz`);
  if (svc.planos.familia != null) lines.push(`👨‍👩‍👧‍👦 Família (3 perfis): ${svc.planos.familia.toLocaleString('pt')} Kz`);
  return lines.join('\n');
}

function planChoicesText(serviceKey) {
  const svc = CATALOGO[serviceKey];
  if (!svc) return '';
  return Object.keys(svc.planos).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' / ');
}

function findPlan(serviceKey, text) {
  const lower = removeAccents(text.toLowerCase());
  const svc = CATALOGO[serviceKey];
  if (!svc) return null;
  for (const [plan, price] of Object.entries(svc.planos)) {
    if (lower.includes(plan)) return { plan, price };
  }
  return null;
}

function detectServices(text) {
  const lower = text.toLowerCase();
  const both = /\bos dois\b|\bambos\b|\btudo\b|\bas duas\b|\bos 2\b/.test(lower);
  const hasNetflix = lower.includes('netflix');
  const hasPrime = lower.includes('prime');
  if (both || (hasNetflix && hasPrime)) return ['netflix', 'prime_video'];
  if (hasNetflix) return ['netflix'];
  if (hasPrime) return ['prime_video'];
  return [];
}

function detectSupportIssue(text) {
  const lower = text.toLowerCase();
  return SUPPORT_KEYWORDS.some(kw => lower.includes(kw));
}

function detectQuantity(text) {
  const lower = removeAccents(text.toLowerCase());
  const patterns = [
    /(\d+)\s*x\s*(?:plano|planos|unidade|unidades|conta|contas)?\s*(?:de\s+)?(?:individual|partilha|familia)/,
    /(\d+)\s+(?:plano|planos|unidade|unidades|conta|contas)\s+(?:de\s+)?(?:individual|partilha|familia)/,
    /(\d+)\s+(?:individual|partilha|familia)/,
    /(?:quero|preciso|queria)\s+(\d+)\s+(?:plano|planos|unidade|unidades|conta|contas|individual|partilha|familia)/,
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const qty = parseInt(match[1] || match[2], 10);
      if (qty >= 2 && qty <= 10) return qty;
    }
  }
  return 1;
}

// ==================== PROMPTS GEMINI ====================
const SYSTEM_PROMPT = `Tu és o assistente de vendas da StreamZone Connect 🤖. Vendes planos de streaming Netflix e Prime Video em Angola.

CATÁLOGO (memoriza — usa SEMPRE estes preços):
Netflix:
  - Individual (1 perfil): 5.000 Kz
  - Partilha (2 perfis): 9.000 Kz
  - Família (3 perfis): 13.500 Kz
Prime Video:
  - Individual (1 perfil): 3.000 Kz
  - Partilha (2 perfis): 5.500 Kz
  - Família (3 perfis): 8.000 Kz

REGRAS ABSOLUTAS:
1. Se o cliente perguntar preços → responde IMEDIATAMENTE com o catálogo acima. Sem hesitar.
2. Se o cliente perguntar "o que é Partilha/Família" → explica: "No plano Partilha recebes 2 perfis. No Família recebes 3 perfis para partilhar."
3. Se o cliente perguntar algo sobre os serviços → responde com base no catálogo. Tu SABES todas as respostas.
4. NUNCA digas "vou verificar", "vou consultar", "vou perguntar à equipa". Tu tens TODA a informação necessária.
5. NUNCA peças pagamento, comprovativo ou PDF a menos que o cliente tenha EXPLICITAMENTE confirmado que quer comprar.
6. NUNCA reveles o IBAN ou dados de pagamento antes do cliente escolher um plano.
7. NUNCA sugiras serviços que não existem (Disney+, HBO, Spotify, etc.).
8. Guia a conversa para escolher Netflix ou Prime Video.
9. Sê caloroso, simpático e profissional. Máximo 2-3 frases por resposta.
10. Responde sempre em Português.
11. Redireciona temas fora do contexto para os nossos serviços.`;

const SYSTEM_PROMPT_COMPROVATIVO = `Tu és o assistente de vendas da StreamZone Connect 🤖. O cliente já escolheu um plano e está na fase de pagamento.

CATÁLOGO (para referência):
Netflix: Individual 5.000 Kz (1 perfil) | Partilha 9.000 Kz (2 perfis) | Família 13.500 Kz (3 perfis)
Prime Video: Individual 3.000 Kz (1 perfil) | Partilha 5.500 Kz (2 perfis) | Família 8.000 Kz (3 perfis)

REGRAS:
- Responde a QUALQUER pergunta do cliente de forma curta, simpática e útil (máximo 2 frases).
- NUNCA inventes dados de pagamento (IBAN, Multicaixa) — o cliente já os recebeu.
- NÃO menciones PDFs, comprovativos ou documentos. NÃO pressiones o envio de nada.
- NUNCA digas "vou verificar", "vou consultar" ou "vou perguntar à equipa". Tu SABES as respostas.
- Termina com: "Estou aqui se precisares de mais alguma coisa! 😊"`;

// ==================== ESTADOS ====================
const chatHistories = {};
const clientStates = {};
const pendingVerifications = {};
const pausedClients = {};
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ==================== VENDAS PERDIDAS ====================
const lostSales = [];
let lostSaleCounter = 1;

function logLostSale(phone, clientName, interests, lastState, reason) {
  const sale = {
    id: lostSaleCounter++,
    phone,
    clientName: clientName || '',
    interests: interests || [],
    lastState: lastState || '',
    reason,
    timestamp: Date.now(),
    recovered: false
  };
  lostSales.push(sale);

  if (MAIN_BOSS) {
    const interestStr = sale.interests.length > 0 ? sale.interests.join(', ') : 'N/A';
    sendWhatsAppMessage(MAIN_BOSS, `📉 *VENDA PERDIDA #${sale.id}*\n👤 ${sale.phone}${sale.clientName ? ' (' + sale.clientName + ')' : ''}\n📦 Interesse: ${interestStr}\n❌ Motivo: ${reason}\n\nUse *recuperar ${sale.id} <mensagem>* para re-contactar.`);
  }

  appendLostSale(sale).catch(e => console.error('Erro ao salvar venda perdida:', e.message));
  return sale;
}

// Sweep aguardando_reposicao — 30min follow-up + 2h timeout final
setInterval(async () => {
  const now = Date.now();
  const THIRTY_MIN = 30 * 60 * 1000;
  const TWO_HOURS_RECOVERY = 2 * 60 * 60 * 1000;
  for (const [num, state] of Object.entries(clientStates)) {
    if (state.step !== 'aguardando_reposicao' && state.step !== 'aguardando_resposta_alternativa') continue;
    const recovery = state.pendingRecovery;
    if (!recovery) continue;
    const elapsed = now - recovery.timestamp;

    if (elapsed >= THIRTY_MIN && !state.recovery30minSent) {
      state.recovery30minSent = true;
      const pedidoDesc = `${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.plan}`;
      await sendWhatsAppMessage(num, `Ainda estamos a verificar a disponibilidade para o teu pedido de ${pedidoDesc}. Entretanto, posso ajudar-te com outra coisa?`);
    }

    if (elapsed >= TWO_HOURS_RECOVERY) {
      const nome = state.clientName;
      await sendWhatsAppMessage(num, `${nome ? nome + ', p' : 'P'}edimos desculpa pela demora. Infelizmente não conseguimos repor o stock a tempo para o teu pedido.\n\nComo compensação, terás *prioridade* na próxima reposição! Vamos notificar-te assim que houver disponibilidade. 😊\n\nSe precisares de algo entretanto, estamos aqui.`);
      logLostSale(num, nome, state.interestStack || [], state.step, `Timeout reposição (2h): ${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.service} ${recovery.plan}`);
      if (MAIN_BOSS) {
        await sendWhatsAppMessage(MAIN_BOSS, `⏰ *TIMEOUT 2H* — Stock não reposto\n👤 ${num} (${nome || ''})\n📦 ${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.service} ${recovery.plan}\nSessão limpa automaticamente.`);
      }
      delete clientStates[num];
      delete chatHistories[num];
    }
  }
}, 5 * 60 * 1000);

// Sweep: clientes inativos há 2+ horas
setInterval(() => {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [num, state] of Object.entries(clientStates)) {
    if (state.lastActivity && (now - state.lastActivity) > TWO_HOURS) {
      if (state.step !== 'inicio' && state.step !== 'esperando_supervisor' && state.step !== 'aguardando_reposicao' && state.step !== 'aguardando_resposta_alternativa' && !pendingVerifications[num]) {
        logLostSale(num, state.clientName, state.interestStack || [], state.step, 'Timeout (2h sem atividade)');
        delete clientStates[num];
        delete chatHistories[num];
      }
    }
  }
}, 30 * 60 * 1000);

// ==================== WHATSAPP ====================
async function sendWhatsAppMessage(number, text) {
  try {
    const cleanTarget = cleanNumber(number);
    console.log(`📤 SEND: cleanTarget="${cleanTarget}" length=${cleanTarget.length}`);
    if (cleanTarget.length < 9 || cleanTarget.length > 15) {
      console.log(`❌ SEND: Número inválido, não enviar.`);
      return false;
    }
    const finalAddress = cleanTarget + '@s.whatsapp.net';
    const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`;
    console.log(`📤 SEND: URL=${url}`);
    console.log(`📤 SEND: Para=${finalAddress} | Texto=${text.substring(0, 60)}...`);
    await axios.post(url, {
      number: finalAddress, text: text, delay: 1200
    }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, httpsAgent });
    console.log(`✅ SEND: Mensagem enviada com sucesso para ${finalAddress}`);
    return true;
  } catch (e) {
    console.error(`❌ FALHA ENVIO para ${number}:`, e.response ? JSON.stringify(e.response.data) : e.message);
    return false;
  }
}

// Envia mensagens separadas de pagamento
async function sendPaymentMessages(number, state) {
  const isMulti = state.cart.length > 1;

  let summary;
  if (isMulti) {
    const lines = state.cart.map((item, i) => {
      const qty = item.quantity || 1;
      const qtyLabel = qty > 1 ? `${qty}x ` : '';
      return `${i + 1}. ${qtyLabel}${item.plataforma} ${item.plan} - ${(item.totalPrice || item.price).toLocaleString('pt')} Kz`;
    });
    summary = `📦 *Resumo do Pedido:*\n${lines.join('\n')}\n💰 *Total: ${state.totalValor.toLocaleString('pt')} Kz*`;
  } else {
    const item = state.cart[0];
    const qty = item.quantity || 1;
    const qtyLabel = qty > 1 ? `${qty}x ` : '';
    summary = `📦 *${qtyLabel}${item.plataforma} - ${item.plan}*\n💰 *Valor: ${(item.totalPrice || item.price).toLocaleString('pt')} Kz*`;
  }
  await sendWhatsAppMessage(number, summary);
  await sendWhatsAppMessage(number, '🏦 *DADOS PARA PAGAMENTO:*');
  await sendWhatsAppMessage(number, PAYMENT.iban);
  await sendWhatsAppMessage(number, PAYMENT.multicaixa);
  await sendWhatsAppMessage(number, `👤 *Titular:* ${PAYMENT.titular}`);
  await sendWhatsAppMessage(number, 'Quando fizeres o pagamento, envia o comprovativo em PDF por aqui. 😊');
}

// ==================== INICIALIZAR ESTADO DO CLIENTE ====================
function initClientState(extra) {
  return {
    step: 'inicio',
    clientName: '',
    isRenewal: false,
    interestStack: [],
    currentItemIndex: 0,
    cart: [],
    serviceKey: null,
    plataforma: null,
    plano: null,
    valor: null,
    totalValor: 0,
    lastActivity: Date.now(),
    repeatTracker: { lastMsg: '', count: 0 },
    paymentReminderSent: false,
    ...extra
  };
}

// =====================================================================
// FIX #1: HANDLER "MUDEI DE IDEIAS" — deteta expressoes de mudanca
// e limpa APENAS os dados do pedido, mantendo o nome do cliente.
// Nunca reinicia com "Olá, sou o Assistente..." se já está em conversa.
// =====================================================================
const CHANGE_MIND_PATTERNS = /\b(mudei de ideias|mudei de ideia|quero outro|quero outra|cancela|cancelar|desistir|trocar|mudar de plano|quero mudar|outro plano|comecar de novo|começar de novo|recomeçar|recomecar)\b/i;

function handleChangeMind(senderNum, state, textMessage) {
  const normalizedText = removeAccents(textMessage.toLowerCase());
  if (!CHANGE_MIND_PATTERNS.test(normalizedText)) return false;

  // Não interceptar se está no inicio ou captura_nome (ainda não tem pedido)
  if (state.step === 'inicio' || state.step === 'captura_nome') return false;
  
  // Não interceptar se está a aguardar supervisor (comprovativo já enviado)
  if (state.step === 'esperando_supervisor') return false;

  // Guardar o nome do cliente
  const savedName = state.clientName;
  
  // Limpar APENAS dados do pedido
  state.step = 'escolha_servico';
  state.cart = [];
  state.serviceKey = null;
  state.plataforma = null;
  state.plano = null;
  state.valor = null;
  state.totalValor = 0;
  state.currentItemIndex = 0;
  state.interestStack = [];
  state.isRenewal = false;
  state.paymentReminderSent = false;
  // MANTER: state.clientName = savedName (já está preservado)
  // MANTER: state.lastActivity (já actualizado)
  
  // Limpar recovery se existir
  delete state.pendingRecovery;
  delete state.recovery30minSent;
  delete state.supervisorResponded;
  
  return true; // sinaliza que foi tratado
}

// ==================== SERVIDOR ====================
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (body.event !== 'messages.upsert') return res.status(200).send('OK');
    const messageData = body.data;
    if (messageData.key.fromMe) return res.status(200).send('Ignore self');

    const remoteJid = messageData.key.remoteJid;
    const senderPn = messageData.key.senderPn || '';
    const rawJid = cleanNumber(remoteJid);
    const realPhone = senderPn ? cleanNumber(senderPn) : rawJid;
    const senderNum = realPhone;
    const lidId = remoteJid.includes('@lid') ? rawJid : null;

    const pushName = messageData.pushName || '';
    const textMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
    const docMsg = messageData.message?.documentMessage;
    const docMime = (docMsg?.mimetype || '').toLowerCase();
    const docFilename = (docMsg?.fileName || '').toLowerCase();
    const isPdf = docMsg && (docMime.includes('pdf') || docFilename.endsWith('.pdf'));
    const isDoc = !!docMsg;
    const isImage = !!messageData.message?.imageMessage;

    // =====================================================================
    // FIX #2: DETECAO DE CONTEXTO DO GRUPO — para mensagens do supervisor
    // no grupo de Atendimento, extrair o contexto (quoted message) para
    // identificar o cliente associado.
    // =====================================================================
    const quotedMessage = messageData.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text || '';

    console.log(`📩 De: ${senderNum} (${pushName}) | Msg: ${textMessage}${lidId ? ` [LID: ${lidId}]` : ''}${quotedText ? ` [Quoted: ${quotedText.substring(0, 50)}...]` : ''}`);

    // ==================== SUPERVISOR ====================
    if (ALL_SUPERVISORS.includes(senderNum)) {
      console.log('👑 Supervisor detetado.');
      const lower = textMessage.toLowerCase().trim();
      const parts = lower.split(/\s+/);
      const command = parts[0];

      // --- Assumir ---
      if (command === 'assumir' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        pausedClients[targetNum] = true;
        await sendWhatsAppMessage(senderNum, `⏸️ Bot pausado para ${targetNum}. Pode falar diretamente.`);
        return res.status(200).send('OK');
      }

      // --- Retomar ---
      if (command === 'retomar' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        delete pausedClients[targetNum];
        await sendWhatsAppMessage(senderNum, `▶️ Bot reativado para ${targetNum}.`);
        return res.status(200).send('OK');
      }

      // --- Liberar ---
      if (command === 'liberar' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        const existing = await checkClientInSheet(targetNum);
        if (existing) {
          await markProfileAvailable(existing.rowIndex);
          delete clientStates[targetNum];
          delete pendingVerifications[targetNum];
          delete chatHistories[targetNum];
          delete pausedClients[targetNum];
          await sendWhatsAppMessage(senderNum, `🔓 Perfil de ${targetNum} libertado (${existing.plataforma}).`);
        } else {
          await sendWhatsAppMessage(senderNum, `⚠️ Nenhum perfil encontrado para ${targetNum}.`);
        }
        return res.status(200).send('OK');
      }

      // Comando "reposto" — supervisor confirma reposição de stock
      if (command === 'reposto' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        const targetState = clientStates[targetNum];
        if (!targetState || targetState.step !== 'aguardando_reposicao') {
          await sendWhatsAppMessage(senderNum, `⚠️ Cliente ${targetNum} não está a aguardar reposição de stock.`);
          return res.status(200).send('OK');
        }
        const recovery = targetState.pendingRecovery;
        if (!recovery) {
          await sendWhatsAppMessage(senderNum, `⚠️ Sem dados de recuperação para ${targetNum}.`);
          return res.status(200).send('OK');
        }
        const profileType = PLAN_PROFILE_TYPE[recovery.plan.toLowerCase()] || 'shared_profile';
        let stockProfiles = await findAvailableProfiles(recovery.service, recovery.totalSlots, profileType);
        if (!stockProfiles) {
          const altType = profileType === 'full_account' ? 'shared_profile' : 'full_account';
          stockProfiles = await findAvailableProfiles(recovery.service, recovery.totalSlots, altType);
        }
        if (!stockProfiles) {
          await sendWhatsAppMessage(senderNum, `❌ Stock ainda insuficiente para ${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.service} ${recovery.plan} (${recovery.totalSlots} slots).`);
          return res.status(200).send('OK');
        }
        const planLabel = recovery.plan;
        const qty = recovery.qty;
        const price = CATALOGO[recovery.serviceKey] ? CATALOGO[recovery.serviceKey].planos[recovery.plan.toLowerCase()] : 0;
        const totalPrice = price * qty;
        const slotsPerUnit = PLAN_SLOTS[recovery.plan.toLowerCase()] || 1;
        targetState.cart = [{
          serviceKey: recovery.serviceKey,
          plataforma: recovery.service,
          plan: planLabel,
          price: price,
          quantity: qty,
          slotsNeeded: slotsPerUnit,
          totalSlots: recovery.totalSlots,
          totalPrice: totalPrice
        }];
        targetState.totalValor = totalPrice;
        targetState.step = 'aguardando_comprovativo';
        delete targetState.pendingRecovery;
        targetState.supervisorResponded = true;
        await sendWhatsAppMessage(targetNum, `✅ Boa notícia${targetState.clientName ? ', ' + targetState.clientName : ''}! Já temos disponibilidade para o teu pedido de ${qty > 1 ? qty + 'x ' : ''}*${planLabel}* de ${recovery.service}. 🎉`);
        await sendPaymentMessages(targetNum, targetState);
        await sendWhatsAppMessage(senderNum, `✅ Venda retomada para ${targetNum}. Pagamento enviado ao cliente.`);
        return res.status(200).send('OK');
      }

      // Comando "alternativa" — supervisor sugere plano alternativo
      if (command === 'alternativa' && parts[1]) {
        const altPlan = parts[1].toLowerCase();
        const targetNum = (parts[2] || '').replace(/\D/g, '');
        if (!targetNum) {
          await sendWhatsAppMessage(senderNum, '⚠️ Formato: alternativa [plano] [número do cliente]');
          return res.status(200).send('OK');
        }
        const targetState = clientStates[targetNum];
        if (!targetState || targetState.step !== 'aguardando_reposicao') {
          await sendWhatsAppMessage(senderNum, `⚠️ Cliente ${targetNum} não está a aguardar reposição.`);
          return res.status(200).send('OK');
        }
        const recovery = targetState.pendingRecovery;
        if (!recovery) {
          await sendWhatsAppMessage(senderNum, `⚠️ Sem dados de recuperação para ${targetNum}.`);
          return res.status(200).send('OK');
        }
        const svcCat = CATALOGO[recovery.serviceKey];
        if (!svcCat || !svcCat.planos[altPlan]) {
          const available = svcCat ? Object.keys(svcCat.planos).join(', ') : 'N/A';
          await sendWhatsAppMessage(senderNum, `⚠️ Plano "${altPlan}" não existe para ${recovery.service}. Disponíveis: ${available}`);
          return res.status(200).send('OK');
        }
        const altPrice = svcCat.planos[altPlan];
        const altPlanLabel = altPlan.charAt(0).toUpperCase() + altPlan.slice(1);
        const altQty = recovery.qty;
        const altTotal = altPrice * altQty;
        targetState.pendingRecovery.suggestedPlan = altPlan;
        targetState.pendingRecovery.suggestedPrice = altPrice;
        targetState.step = 'aguardando_resposta_alternativa';
        targetState.supervisorResponded = true;
        await sendWhatsAppMessage(targetNum, `💡 ${targetState.clientName ? targetState.clientName + ', t' : 'T'}emos uma alternativa para ti!\n\nEm vez de ${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.plan}, podemos oferecer:\n\n📦 ${altQty > 1 ? altQty + 'x ' : ''}*${altPlanLabel}* de ${recovery.service} — ${altTotal.toLocaleString('pt')} Kz\n\nAceitas? (sim / não)`);
        await sendWhatsAppMessage(senderNum, `✅ Alternativa enviada ao cliente ${targetNum}: ${altPlanLabel} (${altTotal.toLocaleString('pt')} Kz).`);
        return res.status(200).send('OK');
      }

      // Comando "cancelar" com número
      if (command === 'cancelar' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        const targetState = clientStates[targetNum];
        if (targetState && (targetState.step === 'aguardando_reposicao' || targetState.step === 'aguardando_resposta_alternativa')) {
          const nome = targetState.clientName;
          await sendWhatsAppMessage(targetNum, `😔 ${nome ? nome + ', l' : 'L'}amentamos mas não foi possível processar o teu pedido desta vez. Esperamos ver-te em breve!\n\nSe precisares de algo, estamos aqui. 😊`);
          logLostSale(targetNum, nome, targetState.interestStack || [], targetState.step, 'Cancelado pelo supervisor');
          delete clientStates[targetNum];
          delete chatHistories[targetNum];
          await sendWhatsAppMessage(senderNum, `✅ Pedido de ${targetNum} cancelado e cliente notificado.`);
        } else {
          await sendWhatsAppMessage(senderNum, `⚠️ Cliente ${targetNum} não tem pedido pendente de reposição.`);
        }
        return res.status(200).send('OK');
      }

      // --- Recuperar venda perdida ---
      if (command === 'recuperar' && parts[1]) {
        const saleId = parseInt(parts[1], 10);
        const customMsg = textMessage.substring(textMessage.indexOf(parts[1]) + parts[1].length).trim();
        const sale = lostSales.find(s => s.id === saleId && !s.recovered);
        if (sale) {
          sale.recovered = true;
          delete pausedClients[sale.phone];
          clientStates[sale.phone] = initClientState({
            step: 'escolha_servico',
            clientName: sale.clientName,
          });
          const msg = customMsg || `Olá${sale.clientName ? ' ' + sale.clientName : ''}! 😊 Notámos que ficou interessado nos nossos serviços. Ainda podemos ajudar?\n\n🎬 *Netflix*\n📺 *Prime Video*`;
          await sendWhatsAppMessage(sale.phone, msg);
          await sendWhatsAppMessage(senderNum, `✅ Cliente ${sale.phone} re-contactado. Venda #${sale.id} marcada como recuperada.`);
        } else {
          await sendWhatsAppMessage(senderNum, `⚠️ Venda #${saleId || '?'} não encontrada ou já recuperada.`);
        }
        return res.status(200).send('OK');
      }

      // --- Listar vendas perdidas ---
      if (command === 'perdas') {
        const pending = lostSales.filter(s => !s.recovered);
        if (pending.length === 0) {
          await sendWhatsAppMessage(senderNum, '✅ Nenhuma venda perdida pendente.');
        } else {
          const lines = pending.map(s => {
            const date = new Date(s.timestamp);
            const dateStr = `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
            return `#${s.id} | ${s.phone}${s.clientName ? ' (' + s.clientName + ')' : ''} | ${s.reason} | ${dateStr}`;
          });
          await sendWhatsAppMessage(senderNum, `📉 *VENDAS PERDIDAS (${pending.length}):*\n\n${lines.join('\n')}\n\nUse *recuperar <ID> <mensagem>* para re-contactar.`);
        }
        return res.status(200).send('OK');
      }

      // =====================================================================
      // FIX #2: APROVAR / REJEITAR — MELHORADO
      // Agora tenta encontrar o cliente de 3 formas:
      //   1. Número explícito na mensagem do supervisor
      //   2. Número extraído da quoted message (contexto do grupo)
      //   3. Se só há 1 pendente, usa esse
      // Quando aprovado, entrega IMEDIATAMENTE e confirma no grupo.
      // =====================================================================
      let action = null;
      if (['sim', 's', 'ok', 'aprovado'].includes(command)) action = 'approve';
      if (['nao', 'n', 'no', 'rejeitado'].includes(command)) action = 'reject';

      if (action) {
        let targetClient = textMessage.match(/\d{9,}/) ? textMessage.match(/\d{9,}/)[0] : null;

        // FIX #2: Se não encontrou número no texto, tentar extrair da quoted message
        if (!targetClient && quotedText) {
          const quotedMatch = quotedText.match(/(\d{9,})/);
          if (quotedMatch) {
            targetClient = quotedMatch[1];
            console.log(`🔍 FIX#2: Número extraído da quoted message: ${targetClient}`);
          }
        }

        if (!targetClient) {
          const pendingList = Object.keys(pendingVerifications);
          if (pendingList.length === 1) targetClient = pendingList[0];
          else if (pendingList.length > 1) {
            const pendingDetails = pendingList.map(num => {
              const pv = pendingVerifications[num];
              return `• ${num}${pv.clientName ? ' (' + pv.clientName + ')' : ''}`;
            }).join('\n');
            await sendWhatsAppMessage(senderNum, `⚠️ Tenho ${pendingList.length} pedidos pendentes:\n${pendingDetails}\n\nEspecifique o número ou responda à notificação do cliente.`);
            return res.status(200).send('OK');
          } else {
            await sendWhatsAppMessage(senderNum, '✅ Nada pendente.');
            return res.status(200).send('OK');
          }
        }

        const pedido = pendingVerifications[targetClient];
        if (!pedido) {
          await sendWhatsAppMessage(senderNum, `⚠️ Cliente ${targetClient} não encontrado nos pendentes.`);
          return res.status(200).send('OK');
        }

        if (action === 'approve') {
          await sendWhatsAppMessage(senderNum, '🔄 Aprovado! A processar...');

          const results = [];
          let allSuccess = true;

          for (const item of pedido.cart) {
            const totalSlots = item.totalSlots || item.slotsNeeded;
            const qty = item.quantity || 1;
            const profileType = PLAN_PROFILE_TYPE[item.plan.toLowerCase()] || 'shared_profile';
            let profiles = null;

            if (pedido.isRenewal) {
              const clientProfiles = await findClientProfiles(targetClient);
              if (clientProfiles) {
                const platProfiles = clientProfiles.filter(p =>
                  p.plataforma.toLowerCase().includes(item.plataforma.toLowerCase())
                );
                if (platProfiles.length > 0) {
                  profiles = platProfiles.map(p => ({ ...p, isRenewal: true }));
                }
              }
            } else {
              // =====================================================================
              // FIX #3: ENTREGA MÚLTIPLA — Buscar EXACTAMENTE totalSlots perfis
              // Para Família = 3 perfis, Partilha = 2 perfis, Individual = 1 perfil
              // O totalSlots já inclui quantity * slotsPerUnit
              // =====================================================================
              console.log(`🔍 FIX#3: Buscando ${totalSlots} perfis para ${item.plataforma} ${item.plan} (type: ${profileType})`);
              profiles = await findAvailableProfiles(item.plataforma, totalSlots, profileType);
              if (!profiles) {
                const altType = profileType === 'full_account' ? 'shared_profile' : 'full_account';
                profiles = await findAvailableProfiles(item.plataforma, totalSlots, altType);
                if (profiles) {
                  await sendWhatsAppMessage(senderNum, `ℹ️ Fallback: ${item.plataforma} ${item.plan} usou tipo ${altType} em vez de ${profileType}.`);
                }
              }
              if (profiles) {
                console.log(`✅ FIX#3: Encontrados ${profiles.length} perfis para ${item.plataforma} ${item.plan}`);
              } else {
                console.log(`❌ FIX#3: Sem perfis suficientes para ${item.plataforma} ${item.plan}`);
              }
            }

            if (profiles && profiles.length > 0) {
              results.push({ item, profiles, success: true });
            } else {
              results.push({ item, profiles: null, success: false });
              allSuccess = false;
            }
          }

          // =====================================================================
          // FIX #3: ENTREGA DE CREDENCIAIS — Loop que monta TODAS as linhas
          // Se Família → 3 linhas (Perfil 1, 2, 3)
          // Se Partilha → 2 linhas (Perfil 1, 2)
          // Se Individual → 1 linha
          // Nunca envia apenas 1 linha para planos multi-perfil.
          // =====================================================================
          if (results.some(r => r.success)) {
            await sendWhatsAppMessage(targetClient, '✅ *Pagamento confirmado!*\n\nAqui estão os dados da sua conta 😊');

            for (const result of results) {
              if (result.success) {
                const profs = result.profiles;
                const qty = result.item.quantity || 1;
                const totalSlots = result.item.totalSlots || result.item.slotsNeeded;
                const svcEmoji = result.item.plataforma.toLowerCase().includes('netflix') ? '🎬' : '📺';
                const qtyLabel = qty > 1 ? ` (${qty}x ${result.item.plan})` : '';
                const planLower = result.item.plan.toLowerCase();
                const slotsPerUnit = PLAN_SLOTS[planLower] || 1;

                let entrega = `${svcEmoji} *${result.item.plataforma}*${qtyLabel}\n`;

                // FIX #3: Garantir que TODOS os perfis são listados
                // Agrupar por email se slotsPerUnit > 1 (Partilha/Familia)
                if (slotsPerUnit > 1 && profs.length >= slotsPerUnit) {
                  // Para cada unidade comprada, mostrar os perfis agrupados
                  for (let unitIdx = 0; unitIdx < qty; unitIdx++) {
                    if (qty > 1) {
                      entrega += `\n📦 *Conta ${unitIdx + 1}:*`;
                    }
                    const startIdx = unitIdx * slotsPerUnit;
                    const endIdx = Math.min(startIdx + slotsPerUnit, profs.length);
                    for (let i = startIdx; i < endIdx; i++) {
                      const profileNum = (i - startIdx) + 1;
                      entrega += `\n✅ Perfil ${profileNum}: ${profs[i].email} | ${profs[i].senha}`;
                      if (profs[i].nomePerfil) entrega += ` | ${profs[i].nomePerfil}`;
                      if (profs[i].pin) entrega += ` | PIN: ${profs[i].pin}`;
                    }
                  }
                } else {
                  // Individual ou fallback — listar todos
                  for (let i = 0; i < profs.length; i++) {
                    entrega += `\n✅ Perfil ${i + 1}: ${profs[i].email} | ${profs[i].senha}`;
                    if (profs[i].nomePerfil) entrega += ` | ${profs[i].nomePerfil}`;
                    if (profs[i].pin) entrega += ` | PIN: ${profs[i].pin}`;
                  }
                }

                await sendWhatsAppMessage(targetClient, entrega);

                // Marcar TODAS as linhas na planilha
                for (const p of profs) {
                  if (p.isRenewal) {
                    await updateSheetCell(p.rowIndex, 'H', todayDate());
                  } else {
                    await markProfileSold(p.rowIndex, pedido.clientName || '', targetClient, 1);
                  }
                }
              }
            }

            // =====================================================================
            // FIX #2: Mensagem pós-venda — bot NÃO fica mudo após entrega
            // Envia fecho + pergunta se precisa de mais alguma coisa
            // =====================================================================
            await sendWhatsAppMessage(targetClient, 'Obrigado por escolheres a StreamZone! 🎉\nQualquer dúvida, estamos aqui para ajudar. 😊\n\nPrecisas de mais alguma coisa?');
          }

          // =====================================================================
          // FIX #2: Confirmar no grupo de Atendimento com nome do cliente
          // =====================================================================
          if (allSuccess) {
            const grandTotalSlots = pedido.cart.reduce((sum, item) => sum + (item.totalSlots || item.slotsNeeded), 0);
            const totalProfiles = results.reduce((sum, r) => sum + (r.profiles ? r.profiles.length : 0), 0);
            const cartDesc = pedido.cart.map(item => {
              const q = item.quantity || 1;
              return `${q > 1 ? q + 'x ' : ''}${item.plataforma} ${item.plan}`;
            }).join(', ');
            const clientLabel = pedido.clientName || targetClient;
            await sendWhatsAppMessage(senderNum, `✅ Entrega realizada para ${clientLabel}! ${cartDesc} (${grandTotalSlots} slot(s), ${totalProfiles} perfil(s) marcados).`);
          } else {
            const failed = results.filter(r => !r.success);
            const failedNames = failed.map(r => {
              const q = r.item.quantity || 1;
              return `${q > 1 ? q + 'x ' : ''}${r.item.plataforma} ${r.item.plan}`;
            }).join(', ');
            if (results.some(r => r.success)) {
              await sendWhatsAppMessage(targetClient, `⚠️ Alguns serviços serão enviados manualmente: ${failedNames}`);
            } else {
              await sendWhatsAppMessage(targetClient, 'Pagamento recebido! A equipa vai enviar os dados em breve. 😊');
            }
            await sendWhatsAppMessage(senderNum, `⚠️ *SEM STOCK* para: ${failedNames}. Envie manualmente!`);
          }

          delete pendingVerifications[targetClient];
          // FIX #2: NÃO apagar o clientState imediatamente — manter para pós-venda
          // O cliente pode querer fazer nova compra. Resettamos para escolha_servico.
          if (clientStates[targetClient]) {
            const savedName = clientStates[targetClient].clientName;
            clientStates[targetClient] = initClientState({
              clientName: savedName,
              step: 'escolha_servico',
            });
          }
          delete chatHistories[targetClient];
        } else {
          // Rejeitar
          await sendWhatsAppMessage(targetClient, '❌ Comprovativo inválido. Por favor, envie o comprovativo de pagamento APENAS em formato PDF. 📄');
          if (clientStates[targetClient]) {
            clientStates[targetClient].step = 'aguardando_comprovativo';
          }
          delete pendingVerifications[targetClient];
          await sendWhatsAppMessage(senderNum, '❌ Rejeitado. Cliente pode reenviar.');
        }
      }
      return res.status(200).send('OK');
    }

    // ==================== CLIENTE ====================
    console.log(`🔍 DEBUG: senderNum="${senderNum}" length=${senderNum.length}`);
    if (senderNum.length < 9 || senderNum.length > 15) {
      console.log(`🚫 DEBUG: Número inválido (length=${senderNum.length})`);
      return res.status(200).send('OK');
    }

    if (pausedClients[senderNum]) {
      console.log(`⏸️ ${senderNum} está pausado.`);
      return res.status(200).send('OK');
    }

    if (!clientStates[senderNum]) clientStates[senderNum] = initClientState();
    if (!chatHistories[senderNum]) chatHistories[senderNum] = [];

    const state = clientStates[senderNum];
    state.lastActivity = Date.now();
    console.log(`🔍 DEBUG: step="${state.step}" para ${senderNum}`);

    // =====================================================================
    // FIX #1: HANDLER GLOBAL "MUDEI DE IDEIAS"
    // Intercepta ANTES de qualquer step (excepto inicio, captura_nome,
    // esperando_supervisor). Limpa pedido, mantém nome, NÃO reinicia saudação.
    // =====================================================================
    if (textMessage && handleChangeMind(senderNum, state, textMessage)) {
      const nome = state.clientName;
      await sendWhatsAppMessage(senderNum, `Sem problemas${nome ? ', ' + nome : ''}! O que gostarias de escolher agora?\n\n🎬 *Netflix*\n📺 *Prime Video*`);
      return res.status(200).send('OK');
    }

    // ---- DETEÇÃO DE LOOP: 3 mensagens iguais seguidas → suporte humano ----
    if (textMessage && state.step !== 'esperando_supervisor') {
      const normalizedMsg = textMessage.trim().toLowerCase();
      if (state.repeatTracker && normalizedMsg === state.repeatTracker.lastMsg) {
        state.repeatTracker.count++;
        if (state.repeatTracker.count >= 3) {
          pausedClients[senderNum] = true;
          await sendWhatsAppMessage(senderNum, 'Parece que estou com dificuldades em entender. Vou chamar um suporte humano para te ajudar! 🛠️');
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `🔁 *LOOP DETETADO*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage}" (repetido ${state.repeatTracker.count}x)\n📍 Step: ${state.step}\n\nBot pausado. Use *retomar ${senderNum}* quando resolver.`);
          }
          return res.status(200).send('OK');
        }
      } else {
        state.repeatTracker = { lastMsg: normalizedMsg, count: 1 };
      }
    }

    // ---- STEP: esperando_supervisor ----
    if (state.step === 'esperando_supervisor') {
      // FIX #2: Mensagem mais informativa enquanto aguarda validação
      await sendWhatsAppMessage(senderNum, '⏳ Obrigado! O supervisor está a validar o teu pagamento. Assim que for aprovado, os teus acessos aparecerão aqui. 😊');
      return res.status(200).send('OK');
    }

    // STEP: aguardando_reposicao
    if (state.step === 'aguardando_reposicao') {
      const recovery = state.pendingRecovery;
      const pedidoDesc = recovery ? `${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.plan} de ${recovery.service}` : 'o teu pedido';
      await sendWhatsAppMessage(senderNum, `⏳ Estamos a tratar da disponibilidade para ${pedidoDesc}. Vais receber uma resposta em breve!`);
      return res.status(200).send('OK');
    }

    // STEP: aguardando_resposta_alternativa
    if (state.step === 'aguardando_resposta_alternativa') {
      const lower = textMessage.toLowerCase().trim();
      if (['sim', 's', 'ok', 'aceito', 'yes'].includes(lower)) {
        const recovery = state.pendingRecovery;
        const altPlan = recovery.suggestedPlan;
        const altPrice = recovery.suggestedPrice;
        const qty = recovery.qty;
        const altPlanLabel = altPlan.charAt(0).toUpperCase() + altPlan.slice(1);
        const slotsPerUnit = PLAN_SLOTS[altPlan] || 1;
        const totalSlots = slotsPerUnit * qty;
        const totalPrice = altPrice * qty;
        state.cart = [{
          serviceKey: recovery.serviceKey,
          plataforma: recovery.service,
          plan: altPlanLabel,
          price: altPrice,
          quantity: qty,
          slotsNeeded: slotsPerUnit,
          totalSlots: totalSlots,
          totalPrice: totalPrice
        }];
        state.totalValor = totalPrice;
        state.step = 'aguardando_comprovativo';
        delete state.pendingRecovery;
        await sendWhatsAppMessage(senderNum, 'Excelente escolha! 🎉');
        await sendPaymentMessages(senderNum, state);
      } else if (['nao', 'não', 'n', 'no'].includes(lower)) {
        const nome = state.clientName;
        logLostSale(senderNum, nome, state.interestStack || [], state.step, 'Cliente recusou plano alternativo');
        delete state.pendingRecovery;
        state.step = 'escolha_servico';
        state.cart = [];
        state.totalValor = 0;
        await sendWhatsAppMessage(senderNum, `Sem problema${nome ? ', ' + nome : ''}! Posso ajudar com outra coisa?\n\n🎬 *Netflix*\n📺 *Prime Video*`);
      } else {
        await sendWhatsAppMessage(senderNum, 'Por favor, responde *sim* para aceitar ou *não* para recusar a alternativa.');
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: aguardando_comprovativo ----
    if (state.step === 'aguardando_comprovativo') {
      if (textMessage) {
        const normalizedText = removeAccents(textMessage.toLowerCase());

        // Cancelamento EXPLÍCITO
        if (/\b(cancelar|cancela|sair|desistir)\b/i.test(normalizedText)) {
          logLostSale(senderNum, state.clientName, state.interestStack || [], state.step, 'Cliente cancelou');
          const nome = state.clientName;
          clientStates[senderNum] = initClientState({ clientName: nome });
          clientStates[senderNum].step = 'escolha_servico';
          await sendWhatsAppMessage(senderNum, 'Pedido cancelado. Como posso ajudar?\n\n🎬 *Netflix*\n📺 *Prime Video*');
          return res.status(200).send('OK');
        }

        // Mudança de serviço
        const changeMindPattern = /\b(outro plano|quero outro|mudar de plano|trocar|corrigir|quero mudar)\b/i;
        if (changeMindPattern.test(normalizedText)) {
          const nome = state.clientName;
          const services = detectServices(textMessage);
          clientStates[senderNum] = initClientState({ clientName: nome });
          const newState = clientStates[senderNum];

          if (services.length > 0) {
            newState.interestStack = services;
            newState.currentItemIndex = 0;
            newState.serviceKey = services[0];
            newState.plataforma = CATALOGO[services[0]].nome;
            newState.step = 'escolha_plano';

            let msg = services.length > 1
              ? `Sem problema! Vamos configurar os dois serviços.\n\nVamos começar com o ${CATALOGO[services[0]].nome}:\n\n`
              : 'Sem problema! ';
            msg += `${formatPriceTable(services[0])}\n\nQual plano deseja? (${planChoicesText(services[0])})`;
            await sendWhatsAppMessage(senderNum, msg);
          } else {
            newState.step = 'escolha_servico';
            await sendWhatsAppMessage(senderNum, `Sem problema${nome ? ', ' + nome : ''}! Qual serviço prefere?\n\n🎬 *Netflix*\n📺 *Prime Video*`);
          }
          return res.status(200).send('OK');
        }

        // Qualquer outra pergunta/texto → IA responde
        try {
          const cartInfo = state.cart.map(i => {
            const qty = i.quantity || 1;
            const qtyLabel = qty > 1 ? `${qty}x ` : '';
            return `${qtyLabel}${i.plataforma} ${i.plan} (${(i.totalPrice || i.price)} Kz, ${i.totalSlots || i.slotsNeeded} perfis)`;
          }).join(', ');
          const contextPrompt = `${SYSTEM_PROMPT_COMPROVATIVO}\n\nPedido atual do cliente: ${cartInfo}. Total: ${state.totalValor} Kz.`;
          const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: { parts: [{ text: contextPrompt }] }
          });
          const chat = model.startChat({ history: chatHistories[senderNum] || [] });
          const resAI = await chat.sendMessage(textMessage);
          const aiText = resAI.response.text();
          chatHistories[senderNum] = chatHistories[senderNum] || [];
          chatHistories[senderNum].push({ role: 'user', parts: [{ text: textMessage }] });
          chatHistories[senderNum].push({ role: 'model', parts: [{ text: aiText }] });
          await sendWhatsAppMessage(senderNum, aiText);
        } catch (e) {
          console.error('Erro AI comprovativo:', e.message);
          await sendWhatsAppMessage(senderNum, 'Estou aqui se precisares de mais alguma coisa! 😊');
        }
        return res.status(200).send('OK');
      }

      // --- FICHEIROS ---
      if (isImage) {
        if (!state.paymentReminderSent) {
          state.paymentReminderSent = true;
          await sendWhatsAppMessage(senderNum, '⚠️ Não aceitamos imagens como comprovativo.\nDeseja enviar o comprovativo em PDF ou quer alterar o seu pedido?');
        } else {
          await sendWhatsAppMessage(senderNum, 'Por favor, envie o comprovativo em formato *PDF*. 📄\nOu escreva *cancelar* para alterar o pedido.');
        }
        return res.status(200).send('OK');
      }

      if (isDoc) {
        const docTypeLabel = isPdf ? '📄 PDF' : `📎 Documento (${docMime || 'tipo desconhecido'})`;

        pendingVerifications[senderNum] = {
          cart: state.cart,
          clientName: state.clientName || '',
          isRenewal: state.isRenewal || false,
          totalValor: state.totalValor,
          timestamp: Date.now()
        };
        state.step = 'esperando_supervisor';

        if (MAIN_BOSS) {
          const renewTag = state.isRenewal ? ' (RENOVAÇÃO)' : '';
          const items = state.cart.map((item, i) => {
            const qty = item.quantity || 1;
            const totalSlots = item.totalSlots || item.slotsNeeded;
            const qtyLabel = qty > 1 ? `${qty}x ` : '';
            return `  ${i + 1}. ${qtyLabel}${item.plataforma} - ${item.plan} (Total ${totalSlots} slot${totalSlots > 1 ? 's' : ''})`;
          }).join('\n');
          const totalStr = state.totalValor ? state.totalValor.toLocaleString('pt') + ' Kz' : 'N/A';
          const msgSuper = `📩 *NOVO COMPROVATIVO*${renewTag} (${docTypeLabel})\n👤 Cliente: ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n📦 Pedido:\n${items}\n💰 Total: ${totalStr}\n\nResponda: *sim* ou *nao*`;
          await sendWhatsAppMessage(MAIN_BOSS, msgSuper);
        }

        // FIX #2: Mensagem ao cliente após enviar comprovativo — não ficar mudo
        await sendWhatsAppMessage(senderNum, '📄 Comprovativo recebido! Obrigado! O supervisor está a validar. Assim que for aprovado, os teus acessos aparecerão aqui. 😊');
        return res.status(200).send('OK');
      }

      return res.status(200).send('OK');
    }

    // ---- STEP: inicio ----
    if (state.step === 'inicio') {
      console.log(`🔍 DEBUG: Entrando no step INICIO para ${senderNum}`);
      const existing = await checkClientInSheet(senderNum);
      console.log(`🔍 DEBUG: checkClientInSheet resultado:`, existing ? 'ENCONTRADO' : 'NAO ENCONTRADO');
      if (existing) {
        const svcKey = existing.plataforma.toLowerCase().includes('netflix') ? 'netflix' : 'prime_video';
        const nome = existing.clienteName || pushName || '';
        state.clientName = nome;
        state.serviceKey = svcKey;
        state.plataforma = existing.plataforma;
        state.isRenewal = true;
        state.interestStack = [svcKey];
        state.currentItemIndex = 0;
        state.step = 'escolha_plano';

        const saudacao = nome
          ? `Olá ${nome}! Sou o Assistente de IA da StreamZone 🤖.`
          : 'Olá! Sou o Assistente de IA da StreamZone 🤖.';
        console.log(`📤 DEBUG: A enviar saudação de renovação para ${senderNum}`);
        await sendWhatsAppMessage(senderNum, `${saudacao}\n\nVejo que já é nosso cliente de *${existing.plataforma}*! Quer renovar?\n\n${formatPriceTable(svcKey)}\n\nQual plano deseja? (${planChoicesText(svcKey)})`);
        return res.status(200).send('OK');
      }

      state.step = 'captura_nome';
      console.log(`📤 DEBUG: A enviar saudação inicial para ${senderNum}`);
      await sendWhatsAppMessage(senderNum, 'Olá! Sou o Assistente de IA da StreamZone 🤖. Com quem tenho o prazer de falar?');
      return res.status(200).send('OK');
    }

    // ---- STEP: captura_nome ----
    if (state.step === 'captura_nome') {
      const name = textMessage.trim();
      if (name.length < 2) {
        await sendWhatsAppMessage(senderNum, 'Por favor, diga-me o seu nome para continuarmos. 😊');
        return res.status(200).send('OK');
      }
      state.clientName = name;
      state.step = 'escolha_servico';

      await sendWhatsAppMessage(senderNum, `Prazer, ${name}! 😊\n\nTemos os seguintes serviços:\n\n🎬 *Netflix*\n📺 *Prime Video*\n\nQual te interessa?`);
      return res.status(200).send('OK');
    }

    // ---- STEP: escolha_servico ----
    if (state.step === 'escolha_servico') {
      const services = detectServices(textMessage);
      if (services.length > 0) {
        const available = [];
        const outOfStock = [];
        for (const svc of services) {
          const stock = await hasAnyStock(CATALOGO[svc].nome);
          if (stock) {
            available.push(svc);
          } else {
            outOfStock.push(svc);
          }
        }

        for (const svc of outOfStock) {
          await sendWhatsAppMessage(senderNum, `😔 De momento não temos *${CATALOGO[svc].nome}* disponível. Vamos notificá-lo assim que houver stock!`);
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *STOCK ESGOTADO* de ${CATALOGO[svc].nome}!\nCliente: ${senderNum} (${state.clientName || 'sem nome'})`);
          }
          logLostSale(senderNum, state.clientName, [svc], 'escolha_servico', `Stock esgotado: ${CATALOGO[svc].nome}`);
        }

        if (available.length === 0) {
          return res.status(200).send('OK');
        }

        state.interestStack = available;
        state.currentItemIndex = 0;
        state.serviceKey = available[0];
        state.plataforma = CATALOGO[available[0]].nome;
        state.step = 'escolha_plano';

        let msg = '';
        if (available.length > 1) {
          msg = `Ótimo! Vamos configurar os dois serviços.\n\nVamos começar com o ${CATALOGO[available[0]].nome}:\n\n`;
        }
        msg += `${formatPriceTable(available[0])}\n\nQual plano deseja? (${planChoicesText(available[0])})`;
        await sendWhatsAppMessage(senderNum, msg);
        return res.status(200).send('OK');
      }

      // Nenhum serviço detetado — usar Gemini
      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
        });
        const chat = model.startChat({ history: chatHistories[senderNum] });
        const resAI = await chat.sendMessage(textMessage || 'Olá');
        const aiText = resAI.response.text();
        chatHistories[senderNum].push({ role: 'user', parts: [{ text: textMessage || 'Olá' }] });
        chatHistories[senderNum].push({ role: 'model', parts: [{ text: aiText }] });
        await sendWhatsAppMessage(senderNum, aiText);
      } catch (e) {
        console.error('Erro AI:', e.message);
        await sendWhatsAppMessage(senderNum, `${state.clientName || ''}, temos *Netflix* e *Prime Video*. Qual te interessa?`);
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: escolha_plano ----
    if (state.step === 'escolha_plano') {
      const chosen = findPlan(state.serviceKey, textMessage);
      if (chosen) {
        const existingItem = state.cart.find(item => item.serviceKey === state.serviceKey);
        if (existingItem) {
          const existingRank = PLAN_RANK[existingItem.plan.toLowerCase()] || 0;
          const chosenRank = PLAN_RANK[chosen.plan] || 0;
          if (chosenRank < existingRank) {
            await sendWhatsAppMessage(senderNum, `Já tens o plano *${existingItem.plan}* selecionado. 😊 Para mudar para um plano inferior, o nosso suporte humano pode ajudar. Desejas continuar com o plano atual ou aguardar?`);
            return res.status(200).send('OK');
          }
        }

        const quantity = detectQuantity(textMessage);
        const slotsPerUnit = PLAN_SLOTS[chosen.plan] || 1;
        const totalSlots = slotsPerUnit * quantity;
        const totalPrice = chosen.price * quantity;
        const profileType = PLAN_PROFILE_TYPE[chosen.plan] || 'shared_profile';

        if (!state.isRenewal) {
          let stockProfiles = await findAvailableProfiles(state.plataforma, totalSlots, profileType);

          if (!stockProfiles) {
            const altType = profileType === 'full_account' ? 'shared_profile' : 'full_account';
            stockProfiles = await findAvailableProfiles(state.plataforma, totalSlots, altType);

            if (stockProfiles && MAIN_BOSS) {
              await sendWhatsAppMessage(MAIN_BOSS, `ℹ️ *FALLBACK*: ${senderNum} pediu ${quantity > 1 ? quantity + 'x ' : ''}${state.plataforma} ${chosen.plan} (${profileType}) mas usou ${altType}.`);
            }
          }

          if (!stockProfiles) {
            const planLabel = chosen.plan.charAt(0).toUpperCase() + chosen.plan.slice(1);
            const availableSlots = await countAvailableProfiles(state.plataforma, profileType);
            const valorEmRisco = chosen.price * quantity;

            state.step = 'aguardando_reposicao';
            state.pendingRecovery = {
              serviceKey: state.serviceKey,
              service: state.plataforma,
              plan: planLabel,
              qty: quantity,
              totalSlots: totalSlots,
              availableSlots: availableSlots,
              timestamp: Date.now()
            };
            state.supervisorResponded = false;
            state.recovery30minSent = false;

            await sendWhatsAppMessage(senderNum, `😔 De momento temos apenas ${availableSlots} perfil(is) disponível(eis) para ${state.plataforma}, mas precisavas de ${totalSlots}. Já passei a informação ao nosso supervisor para resolver isto o mais rápido possível. Vais receber uma resposta em breve!`);

            if (MAIN_BOSS) {
              const history = chatHistories[senderNum] || [];
              const last10 = history.slice(-10);
              const contextLines = last10.length > 0
                ? last10.map(h => {
                    const role = h.role === 'user' ? '👤' : '🤖';
                    const text = (h.parts[0]?.text || '').substring(0, 100);
                    return `${role} ${text}`;
                  }).join('\n')
                : '(sem histórico)';

              await sendWhatsAppMessage(MAIN_BOSS, `⚠️ STOCK INSUFICIENTE — Ação necessária\n\n📋 Resumo:\n- Cliente: ${state.clientName || 'sem nome'} / ${senderNum}\n- Pedido: ${quantity > 1 ? quantity + 'x ' : ''}${planLabel} ${state.plataforma}\n- Slots necessários: ${totalSlots}\n- Slots disponíveis: ${availableSlots}\n- Valor da venda em risco: ${valorEmRisco.toLocaleString('pt')} Kz\n\n💬 Contexto da conversa:\n${contextLines}\n\n🔧 Opções sugeridas:\n1. Repor stock → responder "reposto ${senderNum}"\n2. Oferecer plano alternativo → responder "alternativa [plano] ${senderNum}"\n3. Cancelar → responder "cancelar ${senderNum}"`);
            }

            const capturedNum = senderNum;
            setTimeout(async () => {
              const st = clientStates[capturedNum];
              if (st && st.step === 'aguardando_reposicao' && !st.supervisorResponded) {
                await sendWhatsAppMessage(capturedNum, `Enquanto aguardamos, o teu pedido de ${quantity > 1 ? quantity + 'x ' : ''}*${planLabel}* de ${state.plataforma} está guardado. Assim que houver disponibilidade, retomamos de onde paramos! 😊`);
              }
            }, 90 * 1000);

            return res.status(200).send('OK');
          }
        }

        const planLabel = chosen.plan.charAt(0).toUpperCase() + chosen.plan.slice(1);
        state.cart.push({
          serviceKey: state.serviceKey,
          plataforma: state.plataforma,
          plan: planLabel,
          price: chosen.price,
          quantity: quantity,
          slotsNeeded: slotsPerUnit,
          totalSlots: totalSlots,
          totalPrice: totalPrice
        });
        state.totalValor += totalPrice;

        const addedItem = state.cart[state.cart.length - 1];
        const qtyLabel = quantity > 1 ? `${quantity}x ` : '';

        if (state.currentItemIndex < state.interestStack.length - 1) {
          state.currentItemIndex++;
          const nextSvc = state.interestStack[state.currentItemIndex];
          state.serviceKey = nextSvc;
          state.plataforma = CATALOGO[nextSvc].nome;
          await sendWhatsAppMessage(senderNum, `✅ ${qtyLabel}${addedItem.plataforma} - ${addedItem.plan} adicionado!\n\nAgora vamos ao ${CATALOGO[nextSvc].nome}:\n\n${formatPriceTable(nextSvc)}\n\nQual plano deseja? (${planChoicesText(nextSvc)})`);
        } else if (state.cart.length === 1) {
          state.plano = addedItem.plan;
          state.valor = addedItem.totalPrice;
          state.step = 'aguardando_comprovativo';
          await sendWhatsAppMessage(senderNum, 'Excelente escolha! 🎉');
          await sendPaymentMessages(senderNum, state);
        } else {
          state.step = 'resumo_pedido';
          const lines = state.cart.map((item, i) => {
            const q = item.quantity || 1;
            const ql = q > 1 ? `${q}x ` : '';
            return `${i + 1}. ${ql}${item.plataforma} ${item.plan} - ${item.totalPrice.toLocaleString('pt')} Kz`;
          });
          await sendWhatsAppMessage(senderNum, `📋 *Resumo do Pedido:*\n\n${lines.join('\n')}\n\n💰 *Total: ${state.totalValor.toLocaleString('pt')} Kz*\n\nConfirma? (sim / não)`);
        }
        return res.status(200).send('OK');
      }

      // Texto não é um plano — verificar se é uma pergunta
      try {
        const availPlans = Object.entries(CATALOGO[state.serviceKey].planos).map(([p, price]) => `- ${p.charAt(0).toUpperCase() + p.slice(1)}: ${PLAN_SLOTS[p] || 1} perfil(s), ${price.toLocaleString('pt')} Kz`).join('\n');
        const choicesStr = planChoicesText(state.serviceKey);
        const planContext = `Tu és o Assistente de IA da StreamZone 🤖. O cliente está a escolher um plano de ${state.plataforma}.\n\nPlanos disponíveis:\n${availPlans}\n\nResponde à pergunta do cliente em 1-2 frases curtas e termina SEMPRE com: "Qual plano preferes? (${choicesStr})"`;

        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: { parts: [{ text: planContext }] }
        });
        const chat = model.startChat({ history: [] });
        const resAI = await chat.sendMessage(textMessage);
        await sendWhatsAppMessage(senderNum, resAI.response.text());
      } catch (e) {
        console.error('Erro AI plano:', e.message);
        const fallbackLines = ['Por favor, escolha um dos planos:'];
        if (CATALOGO[state.serviceKey].planos.individual != null) fallbackLines.push('👤 *Individual*');
        if (CATALOGO[state.serviceKey].planos.partilha != null) fallbackLines.push('👥 *Partilha*');
        if (CATALOGO[state.serviceKey].planos.familia != null) fallbackLines.push('👨‍👩‍👧‍👦 *Família*');
        await sendWhatsAppMessage(senderNum, fallbackLines.join('\n'));
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: resumo_pedido ----
    if (state.step === 'resumo_pedido') {
      const lower = textMessage.toLowerCase().trim();
      if (['sim', 's', 'ok', 'confirmo', 'confirmar', 'yes'].includes(lower)) {
        state.step = 'aguardando_comprovativo';
        await sendPaymentMessages(senderNum, state);
      } else if (['nao', 'não', 'n', 'no', 'cancelar'].includes(lower)) {
        state.cart = [];
        state.totalValor = 0;
        state.interestStack = [];
        state.currentItemIndex = 0;
        state.step = 'escolha_servico';
        await sendWhatsAppMessage(senderNum, 'Pedido cancelado. Como posso ajudar?\n\n🎬 *Netflix*\n📺 *Prime Video*');
      } else {
        await sendWhatsAppMessage(senderNum, 'Por favor, confirme com *sim* ou cancele com *não*.');
      }
      return res.status(200).send('OK');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ ERRO GLOBAL:', error);
    res.status(200).send('Erro');
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Bot v15.0 (StreamZone) rodando na porta ${port}`));
