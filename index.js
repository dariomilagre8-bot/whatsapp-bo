require('dotenv').config();
const branding = require('./branding');
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
  fetchAllRows, updateSheetCell, markProfileSold, markProfileAvailable,
  checkClientInSheet, findAvailableProfile, findAvailableProfiles, findClientProfiles,
  hasAnyStock, countAvailableProfiles, appendLostSale,
  isIndisponivel, findClientByName, updateClientPhone,
} = require('./googleSheets');
const { supabase } = require('./supabase');

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-secret'],
}));

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
    const { nome, whatsapp, plataforma, plano, quantidade, total, email } = req.body;
    const filename = req.file ? req.file.filename : 'sem ficheiro';

    // Registar pendingVerification para que o supervisor possa aprovar via "sim [número]" ou pelo painel admin
    const cleanWa = (whatsapp || '').replace(/\D/g, '');
    if (cleanWa) {
      const serviceKey = (plataforma || '').toLowerCase().includes('netflix') ? 'netflix' : 'prime_video';
      const planLower = (plano || 'individual').toLowerCase();
      const slotsPerUnit = PLAN_SLOTS[planLower] || 1;
      const qty = parseInt(quantidade, 10) || 1;
      const totalVal = parseInt(total, 10) || 0;
      const unitPrice = CATALOGO[serviceKey]?.planos[planLower] || Math.round(totalVal / qty);
      const planLabel = planLower.charAt(0).toUpperCase() + planLower.slice(1);

      pendingVerifications[cleanWa] = {
        cart: [{
          serviceKey,
          plataforma: CATALOGO[serviceKey]?.nome || plataforma,
          plan: planLabel,
          price: unitPrice,
          quantity: qty,
          slotsNeeded: slotsPerUnit,
          totalSlots: slotsPerUnit * qty,
          totalPrice: totalVal,
        }],
        clientName: nome || '',
        email: email || null,
        fromWebsite: true,
        isRenewal: false,
        totalValor: totalVal,
        timestamp: Date.now(),
      };
      if (!clientStates[cleanWa]) {
        clientStates[cleanWa] = initClientState({ clientName: nome || '', step: 'esperando_supervisor' });
      }
    }

    const SUPERVISOR = (process.env.SUPERVISOR_NUMBER || '').split(',')[0].trim().replace(/\D/g, '');
    if (SUPERVISOR) {
      const msg = `📎 *COMPROVATIVO VIA SITE*\n👤 ${nome}\n📱 ${whatsapp}\n📦 ${quantidade}x ${plano} ${plataforma}\n💰 Total: ${parseInt(total || 0, 10).toLocaleString('pt')} Kz\n📄 Ficheiro: ${filename}${email ? `\n📧 Email: ${email}` : ''}\n\nResponda: *sim ${cleanWa}* ou *nao ${cleanWa}*`;
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
    planos: {
      individual: branding.precos.netflix.individual,
      partilha: branding.precos.netflix.partilha,
      familia: branding.precos.netflix.familia,
      familia_completa: branding.precos.netflix.familia_completa,
    }
  },
  prime_video: {
    nome: 'Prime Video',
    emoji: '📺',
    planos: {
      individual: branding.precos.prime.individual,
      partilha: branding.precos.prime.partilha,
      familia: branding.precos.prime.familia,
    }
  }
};

const PLAN_SLOTS = { individual: 1, partilha: 2, familia: 3, familia_completa: 5 };

// Constrói a mensagem de selecção de serviço com base no stock REAL
// Se só um serviço tem stock → vai directo para esse serviço (muda o state)
// Se nenhum tem stock → mensagem de sem stock
async function buildServiceMenuMsg(state, clientName) {
  const nome = clientName ? `, ${clientName}` : '';
  const netflixOk = await hasAnyStock('Netflix');
  const primeOk   = await hasAnyStock('Prime Video');
  if (netflixOk && primeOk) {
    return { msg: `Sem problemas${nome}! O que gostarias de escolher?\n\n🎬 *Netflix*\n📺 *Prime Video*`, step: 'escolha_servico' };
  }
  if (netflixOk) {
    if (state) { state.serviceKey = 'netflix'; state.plataforma = 'Netflix'; }
    return { msg: `Sem problemas${nome}! Temos *Netflix* disponível:\n\n${formatPriceTable('netflix')}\n\nQual plano preferes? (${planChoicesText('netflix')})`, step: 'escolha_plano' };
  }
  if (primeOk) {
    if (state) { state.serviceKey = 'prime_video'; state.plataforma = 'Prime Video'; }
    return { msg: `Sem problemas${nome}! Temos *Prime Video* disponível:\n\n${formatPriceTable('prime_video')}\n\nQual plano preferes? (${planChoicesText('prime_video')})`, step: 'escolha_plano' };
  }
  return { msg: `Lamentamos${nome}! De momento não temos stock disponível. Vamos notificar-te assim que houver disponibilidade. 😔`, step: 'escolha_servico' };
}
const PLAN_RANK = { individual: 1, partilha: 2, familia: 3, familia_completa: 4 };

const PAYMENT = {
  titular: 'Braulio Manuel',
  iban: '0040.0000.7685.3192.1018.3',
  multicaixa: '946014060'
};

const PLAN_PROFILE_TYPE = { individual: 'full_account', partilha: 'shared_profile', familia: 'shared_profile', familia_completa: 'full_account' };

const SUPPORT_KEYWORDS = [
  'não entra', 'nao entra', 'senha errada', 'ajuda', 'travou',
  'não funciona', 'nao funciona', 'problema', 'erro',
  'não consigo', 'nao consigo', 'não abre', 'nao abre'
];

// Tarefa H: Detecção de pedido de atendimento humano
// #humano é o comando oficial; os outros padrões cobrem linguagem natural
const HUMAN_TRANSFER_PATTERN = /(#humano|\bhumano\b|\bfalar com (supervisor|pessoa|humano|atendente)\b|\bquero (falar com |)(supervisor|humano|pessoa|atendente)\b|\batendimento (humano|pessoal)\b|\bfala com (pessoa|humano)\b|\bpreciso de ajuda humana\b|\bquero supervisor\b|\bchamar supervisor\b)/i;

// Tarefa G: Detecção de problema de localização Netflix
const LOCATION_ISSUE_PATTERN = /\b(locali[zs]a[çc][aã]o|locali[zs]ações|locali[zs]oes|casa principal|fora de casa|mudar (localiza[çc][aã]o|casa)|viagem|dispositivo|acesso bloqueado)\b/i;

// Escalação automática — tópicos que o bot não resolve e o supervisor deve tratar
// Cobre erros pós-venda: acesso, senha, conta, credenciais, não funciona, erros de login
const ESCALATION_PATTERN = /\b(email|e-mail|e mail|atualiz(ar|a) (email|e-mail|e mail)|verific(ar|a) (email|e-mail|e mail)|mud(ar|a) (email|e-mail)|tro(car|ca) (email|e-mail)|c[oó]dig[oa].*(email|e-mail)|senha|password|credenci(ais|al)|minha (conta|senha)|perfil.*(n[aã]o|nao).*(abre|funciona|entra)|conta (bloqueada|suspensa|desativada|cancelada|errada)|acesso (negado|bloqueado|suspenso|perdido|expirado)|n[aã]o.*(consigo|posso).*(entrar|aceder|acessar|ver|logar|abrir)|tem.*(um |)problema|tenho.*(um |)problema|n[aã]o.*funciona|n[aã]o.*reconhece|reembolso|devolu[çc][aã]o|reclama[çc][aã]o|insatisfeit|n[aã]o.*receb(i|eu)|n[aã]o.*cheg(ou|a).*acesso|n[aã]o (entra|abre|carrega|liga|conecta)|deu erro|dando erro|erro (de |)(acesso|login|senha|conta)|n[aã]o tenho acesso|perdeu acesso|perdi (o |)acesso|expirou|minha conta (n[aã]o|foi|est[aá])|n[aã]o (est[aá]|esta) (a |)funciona(ndo|r)|nao (entra|abre|funciona|carrega|liga)|nao consigo (entrar|ver|aceder|acessar|logar)|conta (foi |)(bloqueada|suspensa|desativada|encerrada))\b/i;

// Intro throttle — só apresenta Zara 1 vez por hora por número
const INTRO_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora
function shouldSendIntro(phone) {
  const last = lastIntroTimes[phone];
  return !last || (Date.now() - last) > INTRO_COOLDOWN_MS;
}
function markIntroSent(phone) {
  lastIntroTimes[phone] = Date.now();
}

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
  if (svc.planos.familia_completa != null) lines.push(`🏠 Família Completa (5 perfis — conta exclusiva): ${svc.planos.familia_completa.toLocaleString('pt')} Kz`);
  return lines.join('\n');
}

const PLAN_LABELS = {
  individual: 'Individual',
  partilha: 'Partilha',
  familia: 'Família',
  familia_completa: 'Família Completa',
};

function planChoicesText(serviceKey) {
  const svc = CATALOGO[serviceKey];
  if (!svc) return '';
  return Object.keys(svc.planos).map(p => PLAN_LABELS[p] || (p.charAt(0).toUpperCase() + p.slice(1))).join(' / ');
}

// Padrões por ordem de especificidade (mais específico primeiro para evitar conflitos)
const PLAN_DETECT_PATTERNS = {
  familia_completa: /(familia|família)\s*(completa|inteira|toda|exclusiva)/,
  familia: /(familia|família)(?!\s*(completa|inteira|toda|exclusiva))/,
  partilha: /partilha/,
  individual: /individual/,
};

function findPlan(serviceKey, text) {
  const lower = removeAccents(text.toLowerCase());
  const svc = CATALOGO[serviceKey];
  if (!svc) return null;
  for (const [plan, pattern] of Object.entries(PLAN_DETECT_PATTERNS)) {
    if (svc.planos[plan] != null && pattern.test(lower)) {
      return { plan, price: svc.planos[plan] };
    }
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

// ==================== IDENTIDADE DO BOT ====================
const BOT_NAME = 'Zara';
const BOT_IDENTITY = `Chamas-te *${BOT_NAME}* e és a Assistente Virtual de Atendimento da ${branding.nome} 🤖. O teu papel é ajudar clientes a comprar e gerir planos de streaming (Netflix e Prime Video) em Angola. Apresentas-te sempre como "${BOT_NAME}, Assistente Virtual da ${branding.nome}".`;

// ==================== PROMPTS GEMINI ====================
const SYSTEM_PROMPT = `${BOT_IDENTITY}

CATÁLOGO (memoriza — usa SEMPRE estes preços):
Netflix:
  - Individual (1 perfil): ${branding.precos.netflix.individual.toLocaleString('pt')} Kz
  - Partilha (2 perfis): ${branding.precos.netflix.partilha.toLocaleString('pt')} Kz
  - Família (3 perfis): ${branding.precos.netflix.familia.toLocaleString('pt')} Kz
Prime Video:
  - Individual (1 perfil): ${branding.precos.prime.individual.toLocaleString('pt')} Kz
  - Partilha (2 perfis): ${branding.precos.prime.partilha.toLocaleString('pt')} Kz
  - Família (3 perfis): ${branding.precos.prime.familia.toLocaleString('pt')} Kz

REGRAS ABSOLUTAS:
1. Se o cliente perguntar preços → responde IMEDIATAMENTE com o catálogo acima. Sem hesitar.
2. Se o cliente perguntar "o que é Partilha/Família" → explica: "No plano Partilha recebes 2 perfis. No Família recebes 3 perfis para partilhar."
3. Se o cliente perguntar algo sobre os serviços → responde com base no catálogo. Tu SABES todas as respostas.
4. NUNCA digas "vou verificar", "vou consultar", "vou perguntar à equipa". Tu tens TODA a informação necessária.
5. NUNCA peças pagamento, comprovativo ou PDF a menos que o cliente tenha EXPLICITAMENTE confirmado que quer comprar.
6. NUNCA reveles o IBAN ou dados de pagamento antes do cliente escolher um plano.
7. NUNCA sugiras serviços que não existem (Disney+, HBO, Spotify, etc.).
8. Guia a conversa para escolher Netflix ou Prime Video.
9. Sê calorosa, simpática e profissional. Máximo 2-3 frases por resposta.
10. Responde sempre em Português.
11. Redireciona temas fora do contexto para os nossos serviços.
12. Apresenta-te sempre pelo nome "${BOT_NAME}" quando o cliente perguntar quem és.`;

const SYSTEM_PROMPT_COMPROVATIVO = `${BOT_IDENTITY} O cliente já escolheu um plano e está na fase de pagamento.

CATÁLOGO (para referência):
Netflix: Individual ${branding.precos.netflix.individual.toLocaleString('pt')} Kz (1 perfil) | Partilha ${branding.precos.netflix.partilha.toLocaleString('pt')} Kz (2 perfis) | Família ${branding.precos.netflix.familia.toLocaleString('pt')} Kz (3 perfis)
Prime Video: Individual ${branding.precos.prime.individual.toLocaleString('pt')} Kz (1 perfil) | Partilha ${branding.precos.prime.partilha.toLocaleString('pt')} Kz (2 perfis) | Família ${branding.precos.prime.familia.toLocaleString('pt')} Kz (3 perfis)

REGRAS:
- Responde a QUALQUER pergunta do cliente de forma curta, simpática e útil (máximo 2 frases).
- NUNCA inventes dados de pagamento (IBAN, Multicaixa) — o cliente já os recebeu.
- NÃO menciones PDFs, comprovativos ou documentos. NÃO pressiones o envio de nada.
- NUNCA digas "vou verificar", "vou consultar" ou "vou perguntar à equipa". Tu SABES as respostas.
- Apresenta-te como "${BOT_NAME}" se te perguntarem quem és.
- Termina com: "Estou aqui se precisares de mais alguma coisa! 😊"`;

// Prompt base — sem catálogo hardcoded (é construído dinamicamente com stock real no endpoint)
const SYSTEM_PROMPT_CHAT_WEB_BASE = `${BOT_IDENTITY} Estás no site ${branding.nome} a responder dúvidas de visitantes.

REGRAS ABSOLUTAS:
- Responde em 1-3 frases curtas e directas.
- Se perguntarem como comprar → diz "Clica em 'Comprar Agora' no site ou fala connosco no WhatsApp".
- NUNCA reveles dados bancários no chat do site.
- Apresenta-te como "${BOT_NAME}, Assistente Virtual da ${branding.nome}".
- Responde sempre em Português de Angola.
- NUNCA inventes stock — usa APENAS o CATÁLOGO abaixo. Se um serviço não constar, está ESGOTADO.
- Se o cliente perguntar por um serviço esgotado, diz que está temporariamente sem stock e sugere o WhatsApp.`;

// ==================== ESTADOS ====================
const chatHistories = {};
const clientStates = {};
const pendingVerifications = {};
const pausedClients = {};
const lastIntroTimes = {};   // { [phone]: timestamp } — persiste fora do ciclo de sessão
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ==================== PERSISTÊNCIA DE SESSÕES (SUPABASE) ====================
// Sessões são guardadas no Supabase a cada 15s. Ao reiniciar, são restauradas.
// Assim conversas em curso não se perdem após redeploy no EasyPanel.

const dirtySessions = new Set();

function markDirty(phone) {
  dirtySessions.add(phone);
}

async function persistSession(phone) {
  if (!supabase) return;
  try {
    await supabase.from('sessoes').upsert({
      whatsapp: phone,
      client_state: clientStates[phone] || null,
      chat_history: chatHistories[phone] ? chatHistories[phone].slice(-20) : null,
      pending_verification: pendingVerifications[phone] || null,
      is_paused: !!pausedClients[phone],
      last_intro_ts: lastIntroTimes[phone] || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'whatsapp' });
  } catch (e) {
    console.error(`⚠️ persistSession ${phone}:`, e.message);
  }
}

// Remove sessão da memória e do Supabase
function cleanupSession(phone) {
  delete clientStates[phone];
  delete chatHistories[phone];
  delete pendingVerifications[phone];
  delete pausedClients[phone];
  dirtySessions.delete(phone);
  if (supabase) {
    supabase.from('sessoes').delete().eq('whatsapp', phone)
      .then(() => {})
      .catch(e => console.error(`⚠️ cleanupSession Supabase ${phone}:`, e.message));
  }
}

// Restaura todas as sessões activas do Supabase (chamado ao iniciar)
async function loadSessionsOnStartup() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('sessoes').select('*');
    if (error) throw new Error(error.message);
    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    let count = 0;
    for (const row of (data || [])) {
      const phone = row.whatsapp;
      const hasPending = !!row.pending_verification;
      const lastAct = row.client_state?.lastActivity || 0;
      // Descartar sessões inactivas há mais de 2h sem pagamento pendente
      if (!hasPending && (now - lastAct) > TWO_HOURS) continue;
      if (row.client_state) clientStates[phone] = row.client_state;
      if (row.chat_history) chatHistories[phone] = row.chat_history;
      if (row.pending_verification) pendingVerifications[phone] = row.pending_verification;
      if (row.is_paused) pausedClients[phone] = true;
      if (row.last_intro_ts) lastIntroTimes[phone] = row.last_intro_ts;
      count++;
    }
    console.log(`✅ Sessões restauradas do Supabase: ${count}`);
  } catch (e) {
    console.error('❌ Erro ao restaurar sessões:', e.message);
  }
}

// Flush periódico — persiste sessões modificadas a cada 15s
setInterval(async () => {
  if (dirtySessions.size === 0) return;
  const phones = [...dirtySessions];
  dirtySessions.clear();
  for (const phone of phones) {
    await persistSession(phone);
  }
}, 15 * 1000);

// ==================== NETFLIX HOUSEHOLD: DETEÇÃO POR KEYWORDS ====================
// Verifica se nas últimas 3 mensagens do cliente há referência ao erro de residência Netflix
const NETFLIX_HOUSEHOLD_KEYWORDS = [
  'ver temporariamente', 'dispositivo', 'fora de casa',
  'residência', 'residencia', 'não faz parte', 'nao faz parte', 'código',
];

function recentMessagesHaveNetflixKeyword(senderNum) {
  const history = chatHistories[senderNum] || [];
  const lastUserMessages = history
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => removeAccents((m.parts[0]?.text || '').toLowerCase()));
  return lastUserMessages.some(text =>
    NETFLIX_HOUSEHOLD_KEYWORDS.some(kw => text.includes(removeAccents(kw)))
  );
}

// ==================== /qr (página de scan remoto) ====================
app.get('/qr', async (req, res) => {
  try {
    const instanceName = encodeURIComponent(process.env.EVOLUTION_INSTANCE_NAME || '');
    const r = await axios.get(
      `${process.env.EVOLUTION_API_URL}/instance/connect/${instanceName}`,
      { headers: { apikey: process.env.EVOLUTION_API_KEY }, httpsAgent }
    );
    const base64 = r.data?.base64 || '';
    const pairingCode = r.data?.pairingCode || '';
    res.send(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ligar WhatsApp — ${branding.nome}</title>
  <style>
    body{background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;color:#fff;text-align:center;padding:16px}
    h2{color:#25D366;margin-bottom:4px;font-size:1.2rem}
    p{color:#aaa;font-size:.85rem;margin:0 0 16px}
    img{border:5px solid #25D366;border-radius:10px;width:260px;height:260px;display:block}
    .code{font-size:2rem;font-weight:bold;letter-spacing:6px;color:#25D366;margin:12px 0}
    small{color:#555;font-size:.7rem;margin-top:12px}
  </style>
  <meta http-equiv="refresh" content="55">
</head>
<body>
  <h2>📱 ${branding.nome} — Ligar WhatsApp</h2>
  <p>Abre o WhatsApp → Aparelhos Ligados → Ligar Aparelho</p>
  ${base64 ? `<img src="${base64}" alt="QR Code" />` : '<p style="color:#e55">QR indisponível</p>'}
  ${pairingCode ? `<p style="margin-top:16px;color:#aaa;font-size:.85rem">Ou usa o código:</p><div class="code">${pairingCode}</div>` : ''}
  <small>Página actualiza automaticamente a cada 55s</small>
</body>
</html>`);
  } catch (e) {
    res.status(500).send(`<h2 style="color:red;font-family:sans-serif">Erro ao gerar QR: ${e.message}</h2>`);
  }
});

// ==================== /api/stock-public (consulta de stock sem autenticação) ====================
// Usado pelo site para esconder/mostrar serviços com base no stock real
app.get('/api/stock-public', async (req, res) => {
  try {
    const [nfOk, pvOk] = await Promise.all([hasAnyStock('Netflix'), hasAnyStock('Prime Video')]);
    res.json({ netflix: nfOk, prime_video: pvOk });
  } catch (e) {
    // Em caso de erro, assume tudo disponível para não bloquear o site
    res.json({ netflix: true, prime_video: true });
  }
});

// ==================== /api/notify-me (lista de espera de stock) ====================
// Guarda números de clientes que querem ser notificados quando o stock for reposto.
// Quando o supervisor usa "reposto XXXXXXXX" o bot notifica automaticamente.
const stockWaitlist = {}; // { 'Netflix': Set<phone>, 'Prime Video': Set<phone> }

app.post('/api/notify-me', async (req, res) => {
  try {
    const { phone, service } = req.body;
    if (!phone || !service) return res.status(400).json({ error: 'phone e service obrigatórios' });
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) return res.status(400).json({ error: 'Número inválido' });
    const svc = service.trim();
    if (!stockWaitlist[svc]) stockWaitlist[svc] = new Set();
    stockWaitlist[svc].add(cleanPhone);
    console.log(`🔔 Waitlist ${svc}: +${cleanPhone} adicionado (total: ${stockWaitlist[svc].size})`);
    // Notifica supervisor
    const msg = `🔔 *Aviso de Stock*\n\nCliente *+${cleanPhone}* quer ser notificado quando *${svc}* tiver stock.\n\nTotal na fila: ${stockWaitlist[svc].size} pessoa(s).`;
    await sendWhatsAppMessage(process.env.SUPERVISOR_NUMBER || process.env.BOSS_NUMBER, msg).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    console.error('Erro /api/notify-me:', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/waitlist — lista de espera por serviço (admin)
app.get('/api/waitlist', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  const adminSecret = process.env.ADMIN_SECRET || 'streamzone2026';
  if (!secret || secret !== adminSecret) return res.status(401).json({ error: 'Unauthorized' });
  const result = {};
  for (const [svc, phones] of Object.entries(stockWaitlist)) {
    result[svc] = Array.from(phones);
  }
  res.json({ waitlist: result });
});

// ==================== /api/chat (ChatWidget do site) ====================
const webChatHistories = {};

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) return res.status(400).json({ reply: 'Dados em falta.' });
    if (!webChatHistories[sessionId]) webChatHistories[sessionId] = [];

    // Verificar stock real — catálogo construído dinamicamente (só serviços disponíveis)
    const [nfOk, pvOk] = await Promise.all([hasAnyStock('Netflix'), hasAnyStock('Prime Video')]);

    const catalogoLinhas = [];
    if (nfOk) catalogoLinhas.push(`Netflix: Individual ${branding.precos.netflix.individual.toLocaleString('pt')} Kz | Partilha ${branding.precos.netflix.partilha.toLocaleString('pt')} Kz | Família ${branding.precos.netflix.familia.toLocaleString('pt')} Kz`);
    if (pvOk) catalogoLinhas.push(`Prime Video: Individual ${branding.precos.prime.individual.toLocaleString('pt')} Kz | Partilha ${branding.precos.prime.partilha.toLocaleString('pt')} Kz | Família ${branding.precos.prime.familia.toLocaleString('pt')} Kz`);

    const catalogoBloco = catalogoLinhas.length > 0
      ? `CATÁLOGO DISPONÍVEL AGORA (apenas estes — não menciones outros):\n${catalogoLinhas.join('\n')}`
      : `CATÁLOGO: Nenhum serviço disponível de momento. Diz ao cliente que o stock está temporariamente esgotado e que pode deixar contacto no WhatsApp para ser avisado.`;

    const esgotados = [!nfOk && 'Netflix', !pvOk && 'Prime Video'].filter(Boolean);
    const avisoEsgotado = esgotados.length > 0
      ? `\nSERVIÇOS ESGOTADOS (NÃO ofereças, NÃO digas que estão disponíveis): ${esgotados.join(', ')}`
      : '';

    const dynamicPrompt = `${SYSTEM_PROMPT_CHAT_WEB_BASE}\n\n${catalogoBloco}${avisoEsgotado}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const contents = [
      ...webChatHistories[sessionId],
      { role: 'user', parts: [{ text: message }] },
    ];

    const result = await model.generateContent({
      contents,
      systemInstruction: { parts: [{ text: dynamicPrompt }] },
    });
    const reply = result.response.text();

    webChatHistories[sessionId].push({ role: 'user', parts: [{ text: message }] });
    webChatHistories[sessionId].push({ role: 'model', parts: [{ text: reply }] });
    if (webChatHistories[sessionId].length > 20) webChatHistories[sessionId] = webChatHistories[sessionId].slice(-20);
    setTimeout(() => { delete webChatHistories[sessionId]; }, 60 * 60 * 1000);

    res.json({ reply });
  } catch (e) {
    console.error('❌ Erro /api/chat:', e.message, e.stack);
    res.json({ reply: `Olá! Sou ${BOT_NAME}, assistente virtual da ${branding.nome}. Como posso ajudar? Fala connosco também pelo WhatsApp! 😊` });
  }
});

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
      cleanupSession(num);
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
        cleanupSession(num);
      }
    }
  }
}, 30 * 60 * 1000);

// ==================== WHATSAPP ====================
// Retorna { sent: boolean, invalidNumber: boolean }
// invalidNumber=true quando a Evolution API responde {"exists":false} (número sem WhatsApp)
async function sendWhatsAppMessage(number, text) {
  try {
    const cleanTarget = cleanNumber(number);
    console.log(`📤 SEND: cleanTarget="${cleanTarget}" length=${cleanTarget.length}`);
    if (cleanTarget.length < 9 || cleanTarget.length > 15) {
      console.log(`❌ SEND: Número inválido (length), não enviar.`);
      return { sent: false, invalidNumber: false };
    }
    const finalAddress = cleanTarget + '@s.whatsapp.net';
    const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`;
    console.log(`📤 SEND: URL=${url}`);
    console.log(`📤 SEND: Para=${finalAddress} | Texto=${text.substring(0, 60)}...`);
    await axios.post(url, {
      number: finalAddress, text: text, delay: 1200
    }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, httpsAgent });
    console.log(`✅ SEND: Mensagem enviada com sucesso para ${finalAddress}`);
    return { sent: true, invalidNumber: false };
  } catch (e) {
    const data = e.response?.data;
    // Detetar especificamente erro 400 com {"exists":false} da Evolution API
    const isInvalidNumber = (
      e.response?.status === 400 &&
      (data?.exists === false || JSON.stringify(data || '').includes('"exists":false'))
    );
    console.error(`❌ FALHA ENVIO para ${number}:`, e.response ? JSON.stringify(data) : e.message);
    if (isInvalidNumber) {
      console.warn(`⚠️ SEND: Número ${number} não tem WhatsApp (exists: false) — fluxo continuará normalmente.`);
    }
    return { sent: false, invalidNumber: isInvalidNumber };
  }
}

// ==================== EMAIL DE CREDENCIAIS (BREVO) ====================
async function sendCredentialsEmail(toEmail, clientName, productName, allCreds) {
  try {
    const credHtml = allCreds.map(c => {
      const unitHdr = c.unitLabel ? `<p style="color:#888;font-size:11px;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:1px">${c.unitLabel}</p>` : '';
      const perfilHtml = c.nomePerfil ? `<p style="margin:3px 0">👤 Perfil: <strong>${c.nomePerfil}</strong></p>` : '';
      const pinHtml = c.pin ? `<p style="margin:3px 0">🔒 PIN: <strong>${c.pin}</strong></p>` : '';
      return `<div style="background:#1a1a1a;border-radius:10px;padding:16px;margin:10px 0;border:1px solid #333">${unitHdr}<p style="margin:3px 0">📧 Email: <strong>${c.email}</strong></p><p style="margin:3px 0">🔑 Senha: <strong>${c.senha}</strong></p>${perfilHtml}${pinHtml}</div>`;
    }).join('');

    const htmlContent = `<div style="background:#0a0a0a;color:#e5e5e5;font-family:Arial,sans-serif;padding:40px;max-width:600px;margin:0 auto"><h1 style="color:${branding.corPrincipal};margin:0 0 4px 0">${branding.nome}</h1><h2 style="color:#fff;font-weight:400;margin:0 0 24px 0">As Tuas Credenciais ${branding.emoji}</h2><p>Olá <strong>${clientName}</strong>,</p><p>Aqui estão os dados da tua conta <strong>${productName}</strong>:</p>${credHtml}<p style="margin-top:32px;padding-top:16px;border-top:1px solid #222;color:#666;font-size:12px">${branding.nome} · Suporte via WhatsApp: +${branding.whatsappSuporte}</p></div>`;

    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: branding.nome, email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: toEmail, name: clientName }],
      subject: `${branding.nome} — As tuas credenciais de ${productName}`,
      htmlContent,
    }, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });
    console.log(`✅ EMAIL: Credenciais enviadas via Brevo para ${toEmail}`);
    return true;
  } catch (e) {
    console.error('❌ EMAIL: Falha ao enviar via Brevo:', e.response?.data || e.message);
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

// ==================== PROCESSAMENTO DE APROVAÇÃO / REJEIÇÃO ====================
// Função central chamada tanto pelo comando "sim" do WhatsApp como pelo painel Admin.
// Corrige BUG #2: allCreds respeita SEMPRE qty × slotsPerUnit (todos os perfis).
// Corrige BUG #4: se WhatsApp devolver exists:false, cai para email + avisa MAIN_BOSS.
async function processApproval(targetClient, senderNum) {
  const pedido = pendingVerifications[targetClient];
  if (!pedido) return { success: false, allSuccess: false };

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
        if (platProfiles.length > 0) profiles = platProfiles.map(p => ({ ...p, isRenewal: true }));
      }
    } else {
      console.log(`🔍 processApproval: Buscando ${totalSlots} perfis para ${item.plataforma} ${item.plan} (type: ${profileType})`);
      profiles = await findAvailableProfiles(item.plataforma, totalSlots, profileType);
      if (!profiles) {
        const altType = profileType === 'full_account' ? 'shared_profile' : 'full_account';
        profiles = await findAvailableProfiles(item.plataforma, totalSlots, altType);
        if (profiles && senderNum) {
          await sendWhatsAppMessage(senderNum, `ℹ️ Fallback: ${item.plataforma} ${item.plan} usou tipo ${altType} em vez de ${profileType}.`);
        }
      }
    }

    if (profiles && profiles.length > 0) {
      results.push({ item, profiles, success: true });
    } else {
      results.push({ item, profiles: null, success: false });
      allSuccess = false;
    }
  }

  // ── Construir allCreds respeitando SEMPRE qty × slotsPerUnit ─────────────
  // CORRIGE BUG #2: o loop anterior ignorava qty e enviava só a 1ª unidade.
  const allCreds = [];
  for (const result of results) {
    if (result.success) {
      const profs = result.profiles;
      const planLower = result.item.plan.toLowerCase();
      const slotsPerUnit = PLAN_SLOTS[planLower] || 1;
      const qty = result.item.quantity || 1;
      for (let unitIdx = 0; unitIdx < qty; unitIdx++) {
        for (let si = 0; si < slotsPerUnit; si++) {
          const pi = unitIdx * slotsPerUnit + si;
          if (pi < profs.length) {
            allCreds.push({
              plataforma: result.item.plataforma,
              plan: result.item.plan,
              unitLabel: qty > 1 ? `Conta ${unitIdx + 1}` : '',
              email: profs[pi].email,
              senha: profs[pi].senha,
              nomePerfil: profs[pi].nomePerfil || '',
              pin: profs[pi].pin || '',
            });
          }
        }
      }
    }
  }

  if (results.some(r => r.success)) {
    // ── Tentar entregar via WhatsApp — detetar número inválido ───────────
    // CORRIGE BUG #4: Evolution API retorna 400 {"exists":false} para números sem WhatsApp.
    const waCheck = await sendWhatsAppMessage(targetClient, '✅ *Pagamento confirmado!*\n\nAqui estão os dados da sua conta 😊');

    if (waCheck.invalidNumber) {
      // Fallback: enviar email com credenciais se disponível
      if (pedido.email && allCreds.length > 0) {
        const productName = pedido.cart.map(i => `${i.plataforma} ${i.plan}`).join(', ');
        await sendCredentialsEmail(pedido.email, pedido.clientName || 'Cliente', productName, allCreds);
      }
      // Aviso ao MAIN_BOSS independentemente
      if (MAIN_BOSS) {
        const emailStatus = pedido.email
          ? `📧 Credenciais enviadas para: ${pedido.email}`
          : '❌ Sem email alternativo — entregar manualmente.';
        await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *NÚMERO FALSO/INVÁLIDO*\n👤 ${pedido.clientName || 'N/A'} — ${targetClient}\n❌ O número não tem WhatsApp (exists: false).\n${emailStatus}`);
      }
      if (senderNum) {
        await sendWhatsAppMessage(senderNum, `⚠️ Número ${targetClient} inválido (sem WhatsApp).\n${pedido.email ? `📧 Credenciais enviadas para ${pedido.email}.` : '❌ Sem email — entregar manualmente.'}`);
      }
    } else {
      // ── Entregar credenciais via WhatsApp ─────────────────────────────
      for (const result of results) {
        if (result.success) {
          const profs = result.profiles;
          const qty = result.item.quantity || 1;
          const svcEmoji = result.item.plataforma.toLowerCase().includes('netflix') ? '🎬' : '📺';
          const qtyLabel = qty > 1 ? ` (${qty}x ${result.item.plan})` : '';
          const planLower = result.item.plan.toLowerCase();
          const slotsPerUnit = PLAN_SLOTS[planLower] || 1;
          let entrega = `${svcEmoji} *${result.item.plataforma}*${qtyLabel}\n`;
          if (slotsPerUnit > 1 && profs.length >= slotsPerUnit) {
            for (let unitIdx = 0; unitIdx < qty; unitIdx++) {
              if (qty > 1) entrega += `\n📦 *Conta ${unitIdx + 1}:*`;
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
            for (let i = 0; i < profs.length; i++) {
              entrega += `\n✅ Perfil ${i + 1}: ${profs[i].email} | ${profs[i].senha}`;
              if (profs[i].nomePerfil) entrega += ` | ${profs[i].nomePerfil}`;
              if (profs[i].pin) entrega += ` | PIN: ${profs[i].pin}`;
            }
          }
          await sendWhatsAppMessage(targetClient, entrega);
        }
      }
      // Tarefa L: Mensagem de confirmação clara após entrega
      const emailEnviado = pedido.email && allCreds.length > 0;
      if (emailEnviado) {
        await sendCredentialsEmail(pedido.email, pedido.clientName || 'Cliente', pedido.cart.map(i => `${i.plataforma} ${i.plan}`).join(', '), allCreds);
      }
      const confirmMsg = emailEnviado
        ? `✅ Credenciais enviadas aqui via WhatsApp e também para o teu email *${pedido.email}*.\n\n💾 *Guarda bem os dados de acesso!* (tira screenshot desta conversa)\n\nObrigado por escolheres a ${branding.nome}! 🎉 Qualquer dúvida, estamos aqui. 😊`
        : `✅ Credenciais enviadas aqui via WhatsApp.\n\n💾 *Guarda bem os dados de acesso!* (tira screenshot desta conversa)\n\nObrigado por escolheres a ${branding.nome}! 🎉 Qualquer dúvida, estamos aqui. 😊`;
      await sendWhatsAppMessage(targetClient, confirmMsg);
    }

    // Marcar TODOS os perfis na planilha
    for (const result of results) {
      if (result.success) {
        for (const p of result.profiles) {
          if (p.isRenewal) {
            await updateSheetCell(p.rowIndex, 'H', todayDate());
          } else {
            await markProfileSold(p.rowIndex, pedido.clientName || '', targetClient, 1);
          }
        }
      }
    }

    // Registo no Supabase (se disponível) — dual-write não-bloqueante
    if (supabase) {
      try {
        // Upsert cliente
        const { data: cliente } = await supabase
          .from('clientes')
          .upsert({ whatsapp: targetClient, nome: pedido.clientName || '' }, { onConflict: 'whatsapp' })
          .select()
          .single();

        // Registar uma venda por item do carrinho
        for (const result of results) {
          if (result.success) {
            const svcInfo = CATALOGO[result.item.plataforma.toLowerCase()] || {};
            const pricePerUnit = svcInfo.planos ? (svcInfo.planos[result.item.plan.toLowerCase()] || 0) : 0;
            const qty = result.item.quantity || 1;

            await supabase.from('vendas').insert({
              cliente_id: cliente ? cliente.id : null,
              whatsapp: targetClient,
              plataforma: result.item.plataforma,
              plano: result.item.plan,
              quantidade: qty,
              valor_total: pricePerUnit * qty,
              data_expiracao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });
          }
        }
      } catch (e) {
        console.error('Supabase registo falhou (não crítico):', e.message);
      }
    }
  }

  // Notificação ao supervisor sobre o resultado
  if (senderNum && !results.some(r => r.success && !r.success)) {
    if (allSuccess) {
      const grandTotalSlots = pedido.cart.reduce((sum, item) => sum + (item.totalSlots || item.slotsNeeded), 0);
      const totalProfiles = results.reduce((sum, r) => sum + (r.profiles ? r.profiles.length : 0), 0);
      const cartDesc = pedido.cart.map(item => {
        const q = item.quantity || 1;
        return `${q > 1 ? q + 'x ' : ''}${item.plataforma} ${item.plan}`;
      }).join(', ');
      await sendWhatsAppMessage(senderNum, `✅ Entrega realizada para ${pedido.clientName || targetClient}! ${cartDesc} (${grandTotalSlots} slot(s), ${totalProfiles} perfil(s) marcados).`);
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
  }

  // Limpar estado — reinicia sessão após entrega bem-sucedida
  const savedNameAfter = clientStates[targetClient]?.clientName;
  cleanupSession(targetClient);
  clientStates[targetClient] = initClientState({ clientName: savedNameAfter || '', step: 'escolha_servico' });
  markDirty(targetClient);
  return { success: true, allSuccess, totalDelivered: results.filter(r => r.success).length };
}

async function processRejection(targetClient, senderNum) {
  await sendWhatsAppMessage(targetClient, '❌ Comprovativo inválido. Por favor, envie o comprovativo de pagamento APENAS em formato PDF. 📄');
  if (clientStates[targetClient]) {
    clientStates[targetClient].step = 'aguardando_comprovativo';
  }
  delete pendingVerifications[targetClient];
  if (senderNum) await sendWhatsAppMessage(senderNum, '❌ Rejeitado. Cliente pode reenviar.');
  return { success: true };
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
          cleanupSession(targetNum);
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
          cleanupSession(targetNum);
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

      // --- Tarefa G: Protocolo localizações distintas Netflix ---
      if (command === 'localizacao' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        const targetState = clientStates[targetNum];
        const nome = targetState?.clientName || '';
        const msgCliente = (
          `Olá${nome ? ' ' + nome : ''}! 😊\n\n` +
          `Detetámos um acesso à tua conta Netflix fora da localização habitual.\n\n` +
          `*O que deves fazer:*\n` +
          `1️⃣ Abre o Netflix no teu dispositivo\n` +
          `2️⃣ Vai a *Conta → Gerir acesso e dispositivos*\n` +
          `3️⃣ Confirma a tua localização principal\n\n` +
          `Se não conseguires resolver, responde aqui e nós ajudamos! 🙏`
        );
        await sendWhatsAppMessage(targetNum, msgCliente);
        await sendWhatsAppMessage(senderNum, `✅ Mensagem de localização enviada para ${targetNum}${nome ? ' (' + nome + ')' : ''}.`);
        return res.status(200).send('OK');
      }

      // --- Tarefa F: Atualizar PIN de perfil via mensagem do supervisor ---
      // Formato: "pin: 1234 para NomePerfil" ou "pin 1234 NomePerfil"
      const pinMatch = textMessage.match(/\bpin\b\s*[:\-]?\s*(\d{4,6})\s+(?:para\s+)?(.+)/i);
      if (pinMatch) {
        const novoPin = pinMatch[1];
        const targetNome = pinMatch[2].trim().toLowerCase();
        const rows = await fetchAllRows();
        let updated = false;
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const nomePerfil = (row[3] || '').toLowerCase();
          const clienteRaw = (row[6] || '').toLowerCase();
          if (nomePerfil.includes(targetNome) || clienteRaw.split(' - ')[0].includes(targetNome)) {
            await updateSheetCell(i + 1, 'E', novoPin);
            updated = true;
            await sendWhatsAppMessage(senderNum, `✅ PIN ${novoPin} atualizado para "${row[3] || row[6]}" (linha ${i + 1}).`);
            break;
          }
        }
        if (!updated) {
          await sendWhatsAppMessage(senderNum, `⚠️ Perfil "${pinMatch[2].trim()}" não encontrado na Sheet. Verifica o nome.`);
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
          await processApproval(targetClient, senderNum);
        } else {
          await processRejection(targetClient, senderNum);
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
    markDirty(senderNum);
    console.log(`🔍 DEBUG: step="${state.step}" para ${senderNum}`);

    // =====================================================================
    // TAREFA H: PEDIDO DE ATENDIMENTO HUMANO — interceta em qualquer step
    // (exceto quando já está pausado ou a aguardar supervisor)
    // =====================================================================
    if (textMessage && !pausedClients[senderNum] && state.step !== 'esperando_supervisor' && HUMAN_TRANSFER_PATTERN.test(removeAccents(textMessage.toLowerCase()))) {
      pausedClients[senderNum] = true;
      markDirty(senderNum);
      const nome = state.clientName;
      await sendWhatsAppMessage(senderNum, `Claro${nome ? ', ' + nome : ''}! 😊 Vou transferir-te para a nossa equipa. Um supervisor irá falar contigo em breve.`);
      if (MAIN_BOSS) {
        let planInfo = '';
        try {
          const existing = await checkClientInSheet(senderNum);
          if (existing) planInfo = `\n📦 Plano na base: *${existing.plataforma}* (${existing.tipoConta || 'N/A'})`;
        } catch (_) {}
        await sendWhatsAppMessage(MAIN_BOSS,
          `🙋 *PEDIDO DE ATENDIMENTO HUMANO*\n👤 ${senderNum}${nome ? ' (' + nome + ')' : ''}${planInfo}\n📍 Step: ${state.step}\n💬 "${(textMessage || '').substring(0, 150)}"\n\nBot pausado. Use *retomar ${senderNum}* quando terminar.`
        );
      }
      return res.status(200).send('OK');
    }

    // =====================================================================
    // ESCALAÇÃO AUTOMÁTICA — email, senha, problemas, credenciais
    // Pausa o bot e avisa o supervisor — cliente recebe confirmação imediata
    // =====================================================================
    if (textMessage && !pausedClients[senderNum] && state.step !== 'esperando_supervisor' && ESCALATION_PATTERN.test(removeAccents(textMessage.toLowerCase()))) {
      pausedClients[senderNum] = true;
      markDirty(senderNum);
      const nome = state.clientName || pushName || '';
      await sendWhatsAppMessage(senderNum,
        `${nome ? nome + ', o' : 'O'} teu pedido foi recebido! 🙏\nUm membro da nossa equipa irá contactar-te em breve para resolver a situação.\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`
      );
      if (MAIN_BOSS) {
        let planInfo = '';
        try {
          const existing = await checkClientInSheet(senderNum);
          if (existing) planInfo = `\n📦 Plano na base: *${existing.plataforma}* (${existing.tipoConta || 'N/A'})`;
        } catch (_) {}
        await sendWhatsAppMessage(MAIN_BOSS,
          `🔔 *ESCALAÇÃO AUTOMÁTICA*\n👤 ${senderNum}${nome ? ' (' + nome + ')' : ''}${planInfo}\n📍 Step: ${state.step}\n💬 "${textMessage.substring(0, 200)}"\n\n⚠️ Bot pausado. Use *retomar ${senderNum}* quando terminar.`
        );
      }
      return res.status(200).send('OK');
    }

    // =====================================================================
    // TAREFA G: PROBLEMA DE LOCALIZAÇÃO NETFLIX — interceta em qualquer step
    // =====================================================================
    if (textMessage && LOCATION_ISSUE_PATTERN.test(removeAccents(textMessage.toLowerCase()))) {
      const nome = state.clientName;
      await sendWhatsAppMessage(senderNum,
        `Olá${nome ? ' ' + nome : ''}! 😊 Recebi a tua mensagem sobre localização.\n\n` +
        `*O que deves fazer:*\n` +
        `1️⃣ Abre o Netflix no teu dispositivo\n` +
        `2️⃣ Vai a *Conta → Gerir acesso e dispositivos*\n` +
        `3️⃣ Confirma a tua localização principal\n\n` +
        `Se não conseguires resolver em 5 minutos, responde aqui e o nosso supervisor ajuda! 🙏`
      );
      if (MAIN_BOSS) {
        await sendWhatsAppMessage(MAIN_BOSS, `📍 *ERRO LOCALIZAÇÃO NETFLIX*\n👤 ${senderNum}${nome ? ' (' + nome + ')' : ''}\n💬 "${textMessage.substring(0, 80)}"\n\nUse *localizacao ${senderNum}* se precisar de intervir manualmente.`);
      }
      return res.status(200).send('OK');
    }

    // =====================================================================
    // FIX #1: HANDLER GLOBAL "MUDEI DE IDEIAS"
    // Intercepta ANTES de qualquer step (excepto inicio, captura_nome,
    // esperando_supervisor). Limpa pedido, mantém nome, NÃO reinicia saudação.
    // =====================================================================
    if (textMessage && handleChangeMind(senderNum, state, textMessage)) {
      const { msg, step } = await buildServiceMenuMsg(state, state.clientName);
      state.step = step;
      await sendWhatsAppMessage(senderNum, msg);
      return res.status(200).send('OK');
    }

    // ---- DETEÇÃO DE LOOP: 2 mensagens iguais seguidas → suporte humano ----
    if (textMessage && state.step !== 'esperando_supervisor') {
      const normalizedMsg = textMessage.trim().toLowerCase();
      if (state.repeatTracker && normalizedMsg === state.repeatTracker.lastMsg) {
        state.repeatTracker.count++;
        if (state.repeatTracker.count >= 2) {
          pausedClients[senderNum] = true;
          await sendWhatsAppMessage(senderNum, `Parece que estou com dificuldades em entender o teu pedido. Vou chamar a nossa equipa para te ajudar! 🛠️\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`);
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `🔁 *LOOP / PEDIDO NÃO PERCEBIDO*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage}" (repetido ${state.repeatTracker.count}x)\n📍 Step: ${state.step}\n\nBot pausado. Use *retomar ${senderNum}* quando resolver.`);
          }
          return res.status(200).send('OK');
        }
      } else {
        state.repeatTracker = { lastMsg: normalizedMsg, count: 1 };
      }
    }

    // ---- PEDIDO FORA DE CONTEXTO: texto longo ou off-topic em steps de escolha ----
    // Se o cliente está num step de escolha e manda algo completamente irrelevante → pausa + supervisor
    const OUT_OF_CONTEXT_STEPS = ['escolha_servico', 'escolha_plano', 'escolha_quantidade', 'confirmacao_renovacao'];
    const OUT_OF_CONTEXT_PATTERN = /^(boa (tarde|noite|manha)|ol[aá]|bom dia|como est[aá]s|tudo bem|ok|certo|entendido|sim|n[aã]o|obrigad[oa])$/i;
    if (textMessage && OUT_OF_CONTEXT_STEPS.includes(state.step) && textMessage.length > 40 && !OUT_OF_CONTEXT_PATTERN.test(textMessage.trim())) {
      // Mensagem longa num step de escolha — provavelmente off-topic
      const isKnownKeyword = ['netflix', 'prime', 'individual', 'partilha', 'familia', 'sim', 'nao', 'outro', 'cancelar', 'renovar']
        .some(kw => removeAccents(textMessage.toLowerCase()).includes(kw));
      if (!isKnownKeyword) {
        pausedClients[senderNum] = true;
        await sendWhatsAppMessage(senderNum,
          `Não consegui perceber o teu pedido. A nossa equipa irá ajudar-te em breve! 🙏\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`
        );
        if (MAIN_BOSS) {
          await sendWhatsAppMessage(MAIN_BOSS,
            `❓ *PEDIDO DESCONHECIDO / FORA DE CONTEXTO*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n📍 Step: ${state.step}\n💬 "${textMessage.substring(0, 200)}"\n\nBot pausado. Use *retomar ${senderNum}* quando resolver.`
          );
        }
        return res.status(200).send('OK');
      }
    }

    // =====================================================================
    // HANDLER GLOBAL — Deteta menção textual ao erro Netflix "Ver temporariamente"
    // Cobre o caso em que o cliente descreve o problema sem enviar imagem
    // =====================================================================
    const NETFLIX_RESIDENCE_KEYWORDS = [
      'ver temporariamente', 'temporariamente', 'residencia', 'residência',
      'dispositivo nao faz parte', 'dispositivo não faz parte', 'nao faz parte da residencia',
      'fora de casa', 'codigo temporario', 'codigo de acesso', 'acesso temporario',
      'bloqueado netflix', 'netflix bloqueou', 'netflix bloqueo',
    ];
    if (textMessage && state.step !== 'inicio' && state.step !== 'captura_nome') {
      const lowerText = removeAccents(textMessage.toLowerCase());
      const isNetflixResidenceText = NETFLIX_RESIDENCE_KEYWORDS.some(kw => lowerText.includes(removeAccents(kw)));
      if (isNetflixResidenceText) {
        await sendWhatsAppMessage(senderNum,
          `📱 *Problema de Localização Netflix!*\n\nA Netflix está a verificar se o teu dispositivo faz parte da residência. Sigue estes passos simples:\n\n1️⃣ Clica em *"Ver temporariamente"* no ecrã\n2️⃣ Vai aparecer um código numérico\n3️⃣ Insere o código na app quando pedido\n4️⃣ Acesso restaurado! ✅\n\nEste processo é normal quando acedes de um novo local. Se o problema persistir, avisa-me! 😊\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`
        );
        if (MAIN_BOSS) {
          await sendWhatsAppMessage(MAIN_BOSS,
            `📱 *SUPORTE — ERRO DE RESIDÊNCIA*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage.substring(0, 100)}"\n\n✅ Cliente orientado com o passo a passo.\nSe não resolver, use *assumir ${senderNum}*.`
          );
        }
        return res.status(200).send('OK');
      }
    }

    // =====================================================================
    // HANDLER GLOBAL DE IMAGENS — corre em TODOS os steps
    // 1. Se step = aguardando_comprovativo → cai para o handler do step (só aceita PDF)
    // 2. Verifica contexto Netflix → guia de localização
    // 3. Qualquer outra imagem → pede descrição em texto (sem custo de OCR/Vision API)
    //    O ESCALATION_PATTERN existente intercepta automaticamente a descrição e escala.
    // =====================================================================
    if (isImage) {
      if (state.step === 'aguardando_comprovativo') {
        // deixa cair para o handler do step (rejeitará a imagem e pedirá PDF)
      } else {
        const hasNetflixContext = recentMessagesHaveNetflixKeyword(senderNum);
        if (hasNetflixContext) {
          await sendWhatsAppMessage(senderNum,
            `📱 *Erro de Localização Netflix detetado!*\n\nA tua Netflix está a pedir verificação de localização. Sigue estes passos:\n\n1️⃣ Clica em *"Ver temporariamente"* no ecrã\n2️⃣ Vai aparecer um código de acesso numérico\n3️⃣ Insere o código quando a app pedir\n4️⃣ Já consegues ver normalmente! ✅\n\nSe o problema persistir, responde aqui e o nosso suporte ajuda imediatamente. 😊\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`
          );
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS,
              `📱 *AVISO — ERRO DE RESIDÊNCIA NETFLIX*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n📍 Step: ${state.step}\n\n✅ Cliente orientado. Se não resolver, use *assumir ${senderNum}*.`
            );
          }
        } else {
          // Não consigo ler imagens — pedir ao cliente que descreva em texto.
          // Isso permite que o ESCALATION_PATTERN existente intercepte e escale automaticamente.
          await sendWhatsAppMessage(senderNum,
            `📷 Recebi a tua imagem, mas infelizmente não consigo ver o conteúdo de imagens.\n\nPodes descrever em *texto* o que aparece no ecrã? Por exemplo:\n• _"Aparece erro de verificação de email"_\n• _"Pede para confirmar um código"_\n• _"Diz que a conta está bloqueada"_\n• _"Não consigo entrar na conta"_\n\nAssim consigo ajudar-te imediatamente! 😊`
          );
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS,
              `📷 *IMAGEM RECEBIDA (não lida)*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n📍 Step: ${state.step}\n\nCliente enviou imagem (provavelmente erro/screenshot). Bot pediu descrição em texto.\nSe quiser intervir agora: *assumir ${senderNum}*`
            );
          }
        }
        return res.status(200).send('OK');
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
          const { msg: cancelCompMsg, step: cancelCompStep } = await buildServiceMenuMsg(clientStates[senderNum], nome);
          clientStates[senderNum].step = cancelCompStep;
          await sendWhatsAppMessage(senderNum, `Pedido cancelado. ${cancelCompMsg}`);
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
            const { msg, step } = await buildServiceMenuMsg(newState, nome);
            newState.step = step;
            await sendWhatsAppMessage(senderNum, msg);
          }
          return res.status(200).send('OK');
        }

        // Pergunta sobre serviço DIFERENTE do pedido actual → verificar stock real
        const mentionedInComprov = detectServices(textMessage || '');
        const currentSvcKey = state.cart[0]?.serviceKey || state.serviceKey;
        const otherSvcInComprov = mentionedInComprov.find(s => s !== currentSvcKey);
        if (otherSvcInComprov) {
          const currentPlatLabel = state.cart[0]?.plataforma || state.plataforma || '';
          const otherPlatLabel = CATALOGO[otherSvcInComprov].nome;
          const hasOtherStock = await hasAnyStock(otherPlatLabel);
          if (!hasOtherStock) {
            await sendWhatsAppMessage(senderNum,
              `De momento não temos *${otherPlatLabel}* disponível. 😔\n\n` +
              `O teu pedido actual é de *${currentPlatLabel}* — assim que enviares o comprovativo, os acessos são entregues imediatamente! 😊`
            );
          } else {
            await sendWhatsAppMessage(senderNum,
              `Temos *${otherPlatLabel}* disponível! 🎉\n\n` +
              `Neste momento o teu pedido é de *${currentPlatLabel}*. Podes:\n\n` +
              `• Completar o pagamento actual e depois fazer um novo pedido de ${otherPlatLabel}\n` +
              `• Ou escreve *cancelar* se preferires trocar de serviço agora`
            );
          }
          return res.status(200).send('OK');
        }

        // Keywords que indicam pedido de reenvio de dados de pagamento
        const PAYMENT_REQUEST_KEYWORDS = [
          'dados', 'iban', 'pagamento', 'pagar', 'multicaixa', 'transferencia',
          'transferência', 'como pago', 'como pagar', 'reenviar', 'envia de novo',
          'manda de novo', 'manda outra vez', 'não recebi', 'nao recebi',
          'conta', 'número de conta', 'numero de conta', 'referencia', 'referência',
        ];
        const normalizedLower = removeAccents(textMessage.toLowerCase());
        const wantsPaymentData = PAYMENT_REQUEST_KEYWORDS.some(kw => normalizedLower.includes(removeAccents(kw)));

        if (wantsPaymentData) {
          await sendPaymentMessages(senderNum, state);
          return res.status(200).send('OK');
        }

        // Qualquer outra pergunta → IA responde (nunca diz "consulte a conversa anterior")
        try {
          const cartInfo = state.cart.map(i => {
            const qty = i.quantity || 1;
            const qtyLabel = qty > 1 ? `${qty}x ` : '';
            return `${qtyLabel}${i.plataforma} ${i.plan} (${(i.totalPrice || i.price)} Kz, ${i.totalSlots || i.slotsNeeded} perfis)`;
          }).join(', ');
          const contextPrompt = `${SYSTEM_PROMPT_COMPROVATIVO}\n\nPEDIDO ACTUAL DO CLIENTE (usa SEMPRE estes dados — NÃO inventes outros serviços): ${cartInfo}. Total: ${state.totalValor} Kz.\n\nREGRA CRÍTICA 1: NUNCA menciones um serviço diferente do pedido actual. Se o pedido é Prime Video, fala APENAS de Prime Video. Se for Netflix, fala APENAS de Netflix.\nREGRA CRÍTICA 2: NUNCA digas "consulte a conversa anterior" nem "os dados já foram partilhados".\nREGRA CRÍTICA 3: Se o cliente pedir os dados de pagamento, responde apenas: "Claro! Vou reenviar os dados agora mesmo 😊" — o sistema enviará automaticamente.\nREGRA CRÍTICA 4: Se o cliente perguntar "já tem disponível?" ou similar, responde afirmativamente para o serviço do pedido acima.`;
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
          await sendPaymentMessages(senderNum, state);
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

        // Tarefa I: Deduzir o último plano para oferecer renovação rápida
        const qntd = parseInt(existing.qntdPerfis, 10) || 1;
        const tipo = (existing.tipoConta || '').toLowerCase();
        let lastPlan = 'individual';
        if (tipo === 'full_account' && qntd >= 5) lastPlan = 'familia_completa';
        else if (tipo === 'full_account') lastPlan = 'individual';
        else if (qntd >= 3) lastPlan = 'familia';
        else if (qntd >= 2) lastPlan = 'partilha';
        const lastPlanPrice = CATALOGO[svcKey]?.planos[lastPlan] || 0;
        const lastPlanLabel = lastPlan.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

        state.step = 'confirmacao_renovacao';
        state.lastPlan = lastPlan;
        state.lastPlanLabel = lastPlanLabel;
        state.lastPlanPrice = lastPlanPrice;

        const introOk = shouldSendIntro(senderNum);
        if (introOk) markIntroSent(senderNum);
        const saudacao = introOk
          ? (nome ? `Olá ${nome}! 😊 Sou *${BOT_NAME}*, Assistente Virtual da ${branding.nome}. Bem-vindo de volta! 🎉` : `Olá! 😊 Sou *${BOT_NAME}*, Assistente Virtual da ${branding.nome}. Bem-vindo de volta! 🎉`)
          : (nome ? `Olá ${nome}! 😊` : `Olá! 😊`);
        console.log(`📤 DEBUG: A enviar saudação de renovação rápida para ${senderNum}`);
        await sendWhatsAppMessage(senderNum,
          `${saudacao}\n\n` +
          `Vi que és nosso cliente de *${existing.plataforma}* — ${lastPlanLabel}.\n\n` +
          `Queres renovar o mesmo plano por *${lastPlanPrice.toLocaleString('pt')} Kz*?\n\n` +
          `✅ *Sim* — renovar ${lastPlanLabel}\n🔄 *Outro* — escolher plano diferente\n\n` +
          `_Escreve *#humano* se tiveres algum problema e precisares de ajuda humana._`
        );
        return res.status(200).send('OK');
      }

      state.step = 'captura_nome';
      console.log(`📤 DEBUG: A enviar saudação inicial para ${senderNum}`);
      if (shouldSendIntro(senderNum)) {
        markIntroSent(senderNum);
        // Construir lista de serviços disponíveis dinamicamente (não hardcodar)
        const [nfOk, pvOk] = await Promise.all([hasAnyStock('Netflix'), hasAnyStock('Prime Video')]);
        const svcList = [nfOk ? '*Netflix*' : null, pvOk ? '*Prime Video*' : null].filter(Boolean).join(' e ');
        const svcLine = svcList
          ? `Estou aqui para te ajudar a contratar ou renovar planos de ${svcList} em Angola!\n\n`
          : `Estou aqui para te ajudar com os nossos serviços de streaming em Angola!\n\n`;
        await sendWhatsAppMessage(senderNum,
          `Olá! 👋 Sou *${BOT_NAME}*, a Assistente Virtual da ${branding.nome} 🤖\n\n` +
          svcLine +
          `⚠️ *Nota importante:* Estou em fase de implementação e utilizo Inteligência Artificial (Machine Learning). ` +
          `Posso cometer erros enquanto estou em aprendizagem — se isso acontecer, a equipa humana está disponível imediatamente.\n\n` +
          `👉 A qualquer momento, escreve *#humano* para falar com um supervisor.\n\n` +
          `Com quem tenho o prazer de falar? 😊`
        );
      } else {
        await sendWhatsAppMessage(senderNum,
          `Olá! 😊 Como posso ajudar?\n\n_Escreve *#humano* a qualquer momento para falar com um supervisor._`
        );
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: confirmacao_renovacao (Tarefa I) ----
    if (state.step === 'confirmacao_renovacao') {
      const lower = removeAccents(textMessage.toLowerCase().trim());
      if (['sim', 's', 'ok', 'yes', 'quero', 'renovar'].includes(lower) || lower.includes('sim') || lower.includes('renovar')) {
        const slotsPerUnit = PLAN_SLOTS[state.lastPlan] || 1;
        state.cart = [{
          serviceKey: state.serviceKey,
          plataforma: state.plataforma,
          plan: state.lastPlanLabel,
          price: state.lastPlanPrice,
          quantity: 1,
          slotsNeeded: slotsPerUnit,
          totalSlots: slotsPerUnit,
          totalPrice: state.lastPlanPrice,
        }];
        state.totalValor = state.lastPlanPrice;
        state.step = 'aguardando_comprovativo';
        await sendWhatsAppMessage(senderNum, `Ótimo${state.clientName ? ', ' + state.clientName : ''}! 🎉`);
        await sendPaymentMessages(senderNum, state);
      } else {
        // Cliente quer escolher outro plano
        state.step = 'escolha_plano';
        await sendWhatsAppMessage(senderNum, `Sem problema! Aqui estão os planos disponíveis:\n\n${formatPriceTable(state.serviceKey)}\n\nQual plano deseja? (${planChoicesText(state.serviceKey)})`);
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: captura_nome ----
    if (state.step === 'captura_nome') {
      const name = textMessage.trim();
      if (name.length < 2) {
        await sendWhatsAppMessage(senderNum, 'Por favor, diz-me o teu nome para continuarmos. 😊');
        return res.status(200).send('OK');
      }
      state.clientName = name;

      // Tarefa D: Procurar cliente migrado pelo nome (sem número associado)
      try {
        const migrated = await findClientByName(name);
        if (migrated) {
          // Associar o número de WhatsApp ao registo existente
          await updateClientPhone(migrated.rowIndex, migrated.clienteName || name, senderNum);
          console.log(`✅ [Tarefa D] Número ${senderNum} associado ao cliente "${migrated.clienteName}" (linha ${migrated.rowIndex})`);

          const svcKey = migrated.plataforma.toLowerCase().includes('netflix') ? 'netflix' : 'prime_video';
          state.serviceKey = svcKey;
          state.plataforma = migrated.plataforma;
          state.isRenewal = true;
          state.interestStack = [svcKey];
          state.currentItemIndex = 0;

          const qntd = parseInt(migrated.qntdPerfis, 10) || 1;
          const tipo = (migrated.tipoConta || '').toLowerCase();
          let lastPlan = 'individual';
          if (tipo === 'full_account' && qntd >= 5) lastPlan = 'familia_completa';
          else if (tipo === 'full_account') lastPlan = 'individual';
          else if (qntd >= 3) lastPlan = 'familia';
          else if (qntd >= 2) lastPlan = 'partilha';
          const lastPlanPrice = CATALOGO[svcKey]?.planos[lastPlan] || 0;
          const lastPlanLabel = lastPlan.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

          state.step = 'confirmacao_renovacao';
          state.lastPlan = lastPlan;
          state.lastPlanLabel = lastPlanLabel;
          state.lastPlanPrice = lastPlanPrice;

          await sendWhatsAppMessage(senderNum,
            `Prazer${name ? ', ' + name : ''}! 😊 Vi que já és nosso cliente de *${migrated.plataforma}* — ${lastPlanLabel}.\n\n` +
            `Quer renovar o mesmo plano por *${lastPlanPrice.toLocaleString('pt')} Kz*?\n\n` +
            `✅ *Sim* — renovar ${lastPlanLabel}\n🔄 *Outro* — escolher plano diferente`
          );

          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `🔗 *CLIENTE ASSOCIADO*\n👤 ${name}\n📱 ${senderNum}\n🎬 ${migrated.plataforma} (linha ${migrated.rowIndex})\n\nNúmero agora registado automaticamente.`);
          }
          return res.status(200).send('OK');
        }
      } catch (e) {
        console.error('[Tarefa D] Erro na busca por nome:', e.message);
      }

      const { msg: svcMsg, step: svcStep } = await buildServiceMenuMsg(state, null);
      state.step = svcStep;
      await sendWhatsAppMessage(senderNum, `Prazer, ${name}! 😊\n\n${svcMsg.replace(/^Sem problemas[^!]*! /, '')}`);
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

      // Texto não é um plano — verificar primeiro se o cliente mudou de serviço
      const mentionedServices = detectServices(textMessage || '');
      const switchedService = mentionedServices.find(s => s !== state.serviceKey);
      if (switchedService) {
        const hasSwStock = await hasAnyStock(CATALOGO[switchedService].nome);
        if (!hasSwStock) {
          await sendWhatsAppMessage(senderNum,
            `😔 De momento não temos *${CATALOGO[switchedService].nome}* disponível.\n\n` +
            `Mas temos *${CATALOGO[state.serviceKey].nome}* disponível! Qual plano preferes?\n\n` +
            `${formatPriceTable(state.serviceKey)}`
          );
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS,
              `⚠️ *STOCK ESGOTADO* de ${CATALOGO[switchedService].nome}!\nCliente: ${senderNum} (${state.clientName || 'sem nome'}) solicitou em mid-flow.\nMantido no fluxo de ${CATALOGO[state.serviceKey].nome}.`
            );
          }
        } else {
          state.serviceKey = switchedService;
          state.plataforma = CATALOGO[switchedService].nome;
          if (!state.interestStack.includes(switchedService)) {
            state.interestStack = [switchedService];
            state.currentItemIndex = 0;
          } else {
            state.currentItemIndex = state.interestStack.indexOf(switchedService);
          }
          await sendWhatsAppMessage(senderNum,
            `${formatPriceTable(switchedService)}\n\nQual plano preferes? (${planChoicesText(switchedService)})`
          );
        }
        return res.status(200).send('OK');
      }

      // Não é plano nem mudança de serviço — responder com IA sobre o serviço ACTUAL
      try {
        const availPlans = Object.entries(CATALOGO[state.serviceKey].planos).map(([p, price]) => `- ${p.charAt(0).toUpperCase() + p.slice(1)}: ${PLAN_SLOTS[p] || 1} perfil(s), ${price.toLocaleString('pt')} Kz`).join('\n');
        const choicesStr = planChoicesText(state.serviceKey);
        const otherSvc = state.serviceKey === 'netflix' ? 'Prime Video' : 'Netflix';
        const planContext = `Tu és o Assistente de IA da ${branding.nome} 🤖. O cliente está a escolher um plano de *${state.plataforma}* APENAS.\n\nPLANOS DE ${state.plataforma.toUpperCase()} DISPONÍVEIS:\n${availPlans}\n\nREGRAS ABSOLUTAS:\n1. Fala APENAS sobre ${state.plataforma}. NUNCA menciones ${otherSvc} nem outros serviços nesta resposta.\n2. NUNCA confirmes ou negues disponibilidade de stock — isso é gerido automaticamente pelo sistema.\n3. Responde à dúvida do cliente em 1-2 frases curtas.\n4. Termina SEMPRE com: "Qual plano preferes? (${choicesStr})"`;

        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: { parts: [{ text: planContext }] }
        });
        const recentHistory = (chatHistories[senderNum] || []).slice(-10);
        const chat = model.startChat({ history: recentHistory });
        const resAI = await chat.sendMessage(textMessage);
        const aiReplyPlan = resAI.response.text();
        chatHistories[senderNum] = chatHistories[senderNum] || [];
        chatHistories[senderNum].push({ role: 'user', parts: [{ text: textMessage }] });
        chatHistories[senderNum].push({ role: 'model', parts: [{ text: aiReplyPlan }] });
        if (chatHistories[senderNum].length > 20) chatHistories[senderNum] = chatHistories[senderNum].slice(-20);
        await sendWhatsAppMessage(senderNum, aiReplyPlan);
      } catch (e) {
        console.error('Erro AI plano:', e.message);
        const fallbackLines = [`Por favor, escolhe um dos planos de *${state.plataforma}*:`];
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
        const { msg: cancelMsg, step: cancelStep } = await buildServiceMenuMsg(state, state.clientName);
        state.step = cancelStep;
        await sendWhatsAppMessage(senderNum, `Pedido cancelado. ${cancelMsg}`);
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

// ==================== ROTAS ADMIN ====================
// Autenticação via header x-admin-secret (ADMIN_SECRET em .env)
// CORS explícito para permitir chamadas do frontend Vercel com header personalizado.
const adminRouter = express.Router();

adminRouter.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-secret'],
}));
adminRouter.options('*', cors());

adminRouter.use((req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  const adminSecret = process.env.ADMIN_SECRET || 'streamzone2026';
  if (!secret || secret !== adminSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// GET /api/admin/stats
adminRouter.get('/stats', (req, res) => {
  const pendingEntries = Object.entries(pendingVerifications);
  const pendingCount = pendingEntries.length;
  const valorEmRisco = pendingEntries.reduce((sum, [, p]) => sum + (p.totalValor || 0), 0);
  const activeChats = Object.values(clientStates).filter(s => s.step && s.step !== 'inicio').length;
  const lostSalesPending = lostSales.filter(s => !s.recovered).length;
  const lostSalesTotal = lostSales.length;
  res.json({ stats: { pendingCount, activeChats, valorEmRisco, lostSalesPending, lostSalesTotal } });
});

// GET /api/admin/pending
adminRouter.get('/pending', (req, res) => {
  const pending = Object.entries(pendingVerifications).map(([phone, p]) => ({
    phone,
    clientName: p.clientName || '',
    cart: p.cart || [],
    totalValor: p.totalValor || 0,
    timestamp: p.timestamp || Date.now(),
    fromWebsite: p.fromWebsite || false,
    isRenewal: p.isRenewal || false,
  }));
  res.json({ pending });
});

// POST /api/admin/approve
adminRouter.post('/approve', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (!pendingVerifications[phone]) return res.status(404).json({ error: 'not_found' });
  try {
    const result = await processApproval(phone, null);
    res.json({ success: true, allSuccess: result.allSuccess });
  } catch (e) {
    console.error('Erro admin approve:', e.message);
    res.status(500).json({ error: 'Erro ao processar aprovação.' });
  }
});

// POST /api/admin/reject
adminRouter.post('/reject', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  try {
    await processRejection(phone, null);
    res.json({ success: true });
  } catch (e) {
    console.error('Erro admin reject:', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar.' });
  }
});

// GET /api/admin/stock
adminRouter.get('/stock', async (req, res) => {
  try {
    const stock = {};
    for (const [key, svc] of Object.entries(CATALOGO)) {
      const shared = await countAvailableProfiles(svc.nome, 'shared_profile') || 0;
      const full = await countAvailableProfiles(svc.nome, 'full_account') || 0;
      stock[key] = { nome: svc.nome, emoji: svc.emoji, available: shared + full, shared, full };
    }
    res.json({ stock });
  } catch (e) {
    console.error('Erro admin stock:', e.message);
    res.status(500).json({ error: 'Erro ao carregar stock.' });
  }
});

// GET /api/admin/lost-sales
adminRouter.get('/lost-sales', (req, res) => {
  res.json({ lostSales });
});

// POST /api/admin/recover
adminRouter.post('/recover', async (req, res) => {
  const { saleId, message } = req.body;
  const sale = lostSales.find(s => s.id === saleId && !s.recovered);
  if (!sale) return res.status(404).json({ error: 'not_found' });
  sale.recovered = true;
  delete pausedClients[sale.phone];
  clientStates[sale.phone] = initClientState({ step: 'escolha_servico', clientName: sale.clientName });
  const msg = message || `Olá${sale.clientName ? ' ' + sale.clientName : ''}! 😊 Notámos que ficou interessado nos nossos serviços. Ainda podemos ajudar?\n\n🎬 *Netflix*\n📺 *Prime Video*`;
  await sendWhatsAppMessage(sale.phone, msg);
  res.json({ success: true });
});

// GET /api/admin/expiracoes
// Fonte: Google Sheet — colunas G=Cliente[6] H=Telefone[7] I=Data_Venda[8] J=Data_Expiracao[9]
adminRouter.get('/expiracoes', async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;

    const expiracoes = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma   = row[0]  || '';
      const nomePerfil   = row[3]  || '';
      const status       = row[5]  || '';
      const cliente      = row[6]  || '';  // G = Nome do cliente
      const phone        = (row[7] || '').toString().replace(/\D/g, '');  // H = Telefone
      const dataVendaStr = row[8]  || '';  // I = Data_Venda (corrigido: era row[7])
      const plano        = row[12] || nomePerfil;  // M = Plano

      if (!isIndisponivel(status) || !cliente || !dataVendaStr) continue;

      // Parse DD/MM/YYYY
      const parts = dataVendaStr.split('/');
      if (parts.length !== 3) continue;
      const dataVenda = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (isNaN(dataVenda.getTime())) continue;

      // Expiração = dataVenda + 30 dias
      const expiry = new Date(dataVenda);
      expiry.setDate(expiry.getDate() + 30);
      expiry.setHours(0, 0, 0, 0);

      const diasRestantes = Math.round((expiry - today) / msPerDay);

      // Mostrar apenas expirados ou a expirar em ≤ 7 dias
      if (diasRestantes > 7) continue;

      let estado;
      if (diasRestantes < 0)       estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else                         estado = 'aviso';

      expiracoes.push({
        id: i + 1,
        nome: cliente,
        phone,
        plataforma,
        plano,
        diasRestantes,
        estado,
        dataVenda: dataVendaStr,
      });
    }

    expiracoes.sort((a, b) => a.diasRestantes - b.diasRestantes);
    res.json({ expiracoes, fonte: 'sheet' });
  } catch (err) {
    console.error('Erro GET /expiracoes:', err.message);
    res.status(500).json({ error: 'Erro ao ler expirações' });
  }
});

// GET /api/admin/expiracoes-db — expiracoes via Supabase (fonte preferencial)
// Lê tabela `vendas` com JOIN em `clientes`
adminRouter.get('/expiracoes-db', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase não configurado', fallback: true });
  }
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;

    const { data: vendas, error } = await supabase
      .from('vendas')
      .select('id, plataforma, plano, data_expiracao, data_venda, valor_total, clientes(nome, whatsapp)')
      .eq('status', 'ativo')
      .order('data_expiracao', { ascending: true });

    if (error) throw new Error(error.message);

    const expiracoes = [];
    for (const v of (vendas || [])) {
      if (!v.data_expiracao) continue;
      const expiry = new Date(v.data_expiracao);
      expiry.setHours(0, 0, 0, 0);
      const diasRestantes = Math.round((expiry - today) / msPerDay);
      if (diasRestantes > 7) continue;

      let estado;
      if (diasRestantes < 0)       estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else                         estado = 'aviso';

      const cliente = v.clientes || {};
      const phone   = (cliente.whatsapp || '').replace(/\D/g, '');

      expiracoes.push({
        id:            v.id,
        nome:          cliente.nome || '—',
        phone,
        plataforma:    v.plataforma || '—',
        plano:         v.plano || '—',
        diasRestantes,
        estado,
        dataVenda:     v.data_venda ? v.data_venda.split('T')[0] : '',
      });
    }

    expiracoes.sort((a, b) => a.diasRestantes - b.diasRestantes);
    res.json({ expiracoes, fonte: 'supabase' });
  } catch (err) {
    console.error('Erro GET /expiracoes-db:', err.message);
    res.status(500).json({ error: 'Erro ao ler expirações do Supabase' });
  }
});

// POST /api/admin/expiracoes/avisar — aviso manual com templates de marketing
adminRouter.post('/expiracoes/avisar', async (req, res) => {
  const item = req.body;
  if (!item.phone) return res.status(400).json({ error: 'phone obrigatório' });

  const nome      = item.nome || '';
  const plataforma = item.plataforma || '';
  const dias      = item.diasRestantes != null ? item.diasRestantes : -1;
  const website   = branding.website;

  let msg;
  if (dias >= 5) {
    msg = `Olá ${nome}! 😊\n\nO teu plano 🎬 *${plataforma}* expira daqui a *7 dias*.\n\nAproveita para renovar com antecedência e continua a ver os teus filmes e séries favoritos sem interrupções 🍿\n\n👉 Renova aqui: ${website}\n\nQualquer dúvida estamos aqui! 💬`;
  } else if (dias >= 1) {
    msg = `${nome}, atenção! ⏰\n\nO teu plano 🎬 *${plataforma}* expira em apenas *${dias} dia(s)*.\n\nNão percas o acesso às tuas séries a meio — renova agora em menos de 2 minutos 😊\n\n💳 Renova aqui: ${website}\n\nEstamos sempre disponíveis para ajudar! 🙌`;
  } else {
    msg = `${nome}, hoje é o último dia! 🚨\n\nO teu plano 🎬 *${plataforma}* expira *hoje*.\n\nRenova agora e continua a ver sem parar 🎬🍿\n\n🔗 ${website}\n\nObrigado por escolheres a ${branding.nome}! ❤️`;
  }

  await sendWhatsAppMessage(item.phone, msg);
  res.json({ success: true });
});

// POST /api/admin/expiracoes/verificar-agora — trigger manual para testes
adminRouter.post('/expiracoes/verificar-agora', async (req, res) => {
  try {
    const { verificarExpiracoes } = require('./expiracao-modulo');
    await verificarExpiracoes({ sendWhatsAppMessage, MAIN_BOSS, branding, fetchAllRows, markProfileAvailable, isIndisponivel });
    res.json({ success: true, message: 'Verificação concluída — ver logs do servidor para detalhes' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Calcula o preço de um plano com base na plataforma e tipo
function getPrecoDePlano(plataforma, plano) {
  const pStr  = (plataforma || '').toLowerCase();
  const plStr = (plano || '').toLowerCase();
  const p = branding.precos;
  if (pStr.includes('netflix')) {
    if (plStr.includes('familia') || plStr.includes('família')) return p.netflix.familia;
    if (plStr.includes('partilha') || plStr.includes('shared')) return p.netflix.partilha;
    return p.netflix.individual;
  }
  if (pStr.includes('prime')) {
    if (plStr.includes('familia') || plStr.includes('família')) return p.prime.familia;
    if (plStr.includes('partilha') || plStr.includes('shared')) return p.prime.partilha;
    return p.prime.individual;
  }
  return 0;
}

// GET /api/admin/clientes
adminRouter.get('/clientes', async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;

    const clientMap = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma = row[0] || '';
      const nomePerfil = row[3] || '';
      const status    = row[5] || '';
      const cliente   = row[6] || '';
      const dataVendaStr = row[7] || '';
      const tipoConta = row[9] || '';

      if (!isIndisponivel(status) || !cliente || !dataVendaStr) continue;

      const parts = dataVendaStr.split('/');
      if (parts.length !== 3) continue;
      const dataVenda = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (isNaN(dataVenda.getTime())) continue;

      const expiry = new Date(dataVenda);
      expiry.setDate(expiry.getDate() + 30);
      expiry.setHours(0, 0, 0, 0);
      const diasRestantes = Math.round((expiry - today) / msPerDay);

      let estado;
      if (diasRestantes < 0)       estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else if (diasRestantes <= 7) estado = 'aviso';
      else                         estado = 'ok';

      const clienteParts = cliente.split(' - ');
      const nome  = clienteParts.length > 1 ? clienteParts.slice(0, -1).join(' - ') : cliente;
      const phone = clienteParts.length > 1 ? clienteParts[clienteParts.length - 1] : '';
      const key   = phone || nome;

      const planoNome = nomePerfil || tipoConta;
      const valorPago = getPrecoDePlano(plataforma, planoNome);

      if (!clientMap[key]) clientMap[key] = { phone, nome, planos: [] };
      clientMap[key].planos.push({ id: i + 1, plataforma, plano: planoNome, dataVenda: dataVendaStr, diasRestantes, estado, valorPago });
    }

    const estadoRank = { expirado: 0, urgente: 1, aviso: 2, ok: 3 };
    const clientes = Object.values(clientMap).map(c => {
      const worst = c.planos.reduce((w, p) => estadoRank[p.estado] < estadoRank[w.estado] ? p : w, c.planos[0]);
      const totalValor = c.planos
        .filter(p => p.estado !== 'expirado')
        .reduce((sum, p) => sum + (p.valorPago || 0), 0);
      return { ...c, totalPlanos: c.planos.length, diasRestantes: worst.diasRestantes, estado: worst.estado, totalValor };
    });
    clientes.sort((a, b) => estadoRank[a.estado] - estadoRank[b.estado] || a.diasRestantes - b.diasRestantes);

    // Clientes antigos (a_verificar) — sem planos activos, vão no fim da lista
    const seenPhones = new Set(clientes.map(c => c.phone).filter(Boolean));
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const statusRaw = (row[5] || '').toString().toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!statusRaw.includes('a_verificar')) continue;
      const nome  = (row[6] || '').trim();
      const phone = (row[7] || '').toString().replace(/[^0-9]/g, '');
      if (!nome) continue;
      if (seenPhones.has(phone)) continue; // já listado como activo
      seenPhones.add(phone);
      clientes.push({ phone, nome, planos: [], totalPlanos: 0, diasRestantes: null, estado: 'a_verificar', totalValor: 0 });
    }

    // Tarefa M: MRR = soma dos planos ativos (não expirados) de todos os clientes
    const mrr = clientes
      .filter(c => c.estado !== 'expirado' && c.estado !== 'a_verificar')
      .reduce((sum, c) => sum + (c.totalValor || 0), 0);

    res.json({ clientes, mrr });
  } catch (err) {
    console.error('Erro GET /clientes:', err.message);
    res.status(500).json({ error: 'Erro ao ler clientes' });
  }
});

// GET /api/admin/clientes-db — lê clientes + vendas do Supabase
adminRouter.get('/clientes-db', async (req, res) => {
  if (!supabase) return res.json({ clientes: [], mrr: 0 });
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const estadoRank = { expirado: 0, urgente: 1, aviso: 2, ok: 3 };

    // Buscar todos os clientes e todas as vendas activas em paralelo
    const [
      { data: todosClientes, error: errC },
      { data: vendasAtivas,  error: errV },
    ] = await Promise.all([
      supabase.from('clientes').select('id, nome, whatsapp').order('nome'),
      supabase.from('vendas').select('id, cliente_id, plataforma, plano, quantidade, valor_total, data_venda, data_expiracao').eq('status', 'ativo'),
    ]);
    if (errC) throw new Error(errC.message);
    if (errV) throw new Error(errV.message);

    // Indexar vendas por cliente_id
    const vendasPorCliente = {};
    for (const v of (vendasAtivas || [])) {
      if (!vendasPorCliente[v.cliente_id]) vendasPorCliente[v.cliente_id] = [];
      const expiry = v.data_expiracao ? new Date(v.data_expiracao) : null;
      const diasRestantes = expiry !== null ? Math.round((expiry - today) / msPerDay) : null;
      let estado;
      if (diasRestantes === null || diasRestantes === undefined) estado = 'ok';
      else if (diasRestantes < 0)  estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else if (diasRestantes <= 7) estado = 'aviso';
      else                         estado = 'ok';
      vendasPorCliente[v.cliente_id].push({
        id:            v.id,
        plataforma:    v.plataforma,
        plano:         v.plano,
        dataVenda:     v.data_venda ? v.data_venda.split('T')[0] : '',
        diasRestantes: diasRestantes ?? 0,
        estado,
        valorPago:     v.valor_total,
      });
    }

    // Construir lista de clientes
    const clientes = [];
    for (const c of (todosClientes || [])) {
      const planos = vendasPorCliente[c.id] || [];
      if (planos.length === 0) {
        // Cliente sem vendas activas → a_verificar
        clientes.push({ phone: c.whatsapp, nome: c.nome, planos: [], totalPlanos: 0, diasRestantes: null, estado: 'a_verificar', totalValor: 0 });
        continue;
      }
      const worst = planos.reduce((w, p) => (estadoRank[p.estado] ?? 99) < (estadoRank[w.estado] ?? 99) ? p : w, planos[0]);
      const totalValor = planos.filter(p => p.estado !== 'expirado').reduce((s, p) => s + (p.valorPago || 0), 0);
      clientes.push({ phone: c.whatsapp, nome: c.nome, planos, totalPlanos: planos.length, diasRestantes: worst.diasRestantes, estado: worst.estado, totalValor });
    }

    // Ordenar: activos por diasRestantes, a_verificar no fim
    clientes.sort((a, b) => {
      const aV = a.estado === 'a_verificar', bV = b.estado === 'a_verificar';
      if (aV && !bV) return 1;
      if (!aV && bV) return -1;
      if (aV && bV)  return 0;
      return (estadoRank[a.estado] ?? 99) - (estadoRank[b.estado] ?? 99) || (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0);
    });

    const mrr = clientes
      .filter(c => c.estado !== 'expirado' && c.estado !== 'a_verificar')
      .reduce((s, c) => s + (c.totalValor || 0), 0);

    res.json({ clientes, mrr });
  } catch (err) {
    console.error('Erro GET /clientes-db:', err.message);
    res.status(500).json({ error: 'Erro ao ler clientes do Supabase' });
  }
});

// POST /api/admin/clientes/mensagem
adminRouter.post('/clientes/mensagem', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone e message obrigatórios' });
  const result = await sendWhatsAppMessage(phone, message);
  if (!result.sent) return res.status(500).json({ error: 'Falha ao enviar mensagem' });
  res.json({ success: true });
});

// GET /api/admin/financeiro
adminRouter.get('/financeiro', async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const precos = { 'Netflix': branding.precos.netflix.individual, 'Prime Video': branding.precos.prime.individual };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    const fin = {
      hoje: { vendas: 0, receita: 0 },
      esteMes: { vendas: 0, receita: 0 },
      mesPassado: { vendas: 0, receita: 0 },
      totalAtivo: { clientes: 0, receita: 0 },
      porPlataforma: {
        'Netflix': { vendas: 0, receita: 0 },
        'Prime Video': { vendas: 0, receita: 0 },
      },
      ultimos7Dias: [],
    };

    // Mapa dos últimos 7 dias (incluindo hoje)
    const dias7 = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      dias7[key] = { data: key, receita: 0, vendas: 0 };
    }

    const clientesSet = new Set();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!isIndisponivel(row[5])) continue;

      const plataforma = (row[0] || '').trim();
      const cliente    = row[6] || '';
      const dataVendaStr = row[7] || '';
      const quantidade = parseInt(row[8]) || 1;

      if (!dataVendaStr || !cliente) continue;

      const parts = dataVendaStr.split('/');
      if (parts.length !== 3) continue;
      const dataVenda = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (isNaN(dataVenda.getTime())) continue;
      dataVenda.setHours(0, 0, 0, 0);

      const preco = (precos[plataforma] || 0) * quantidade;

      // Clientes activos (receita recorrente)
      clientesSet.add(cliente);
      fin.totalAtivo.receita += preco;

      // Por plataforma
      if (fin.porPlataforma[plataforma]) {
        fin.porPlataforma[plataforma].vendas += quantidade;
        fin.porPlataforma[plataforma].receita += preco;
      }

      // Hoje
      if (dataVenda.getTime() === today.getTime()) {
        fin.hoje.vendas += quantidade;
        fin.hoje.receita += preco;
      }

      // Este mês
      if (dataVenda.getMonth() === thisMonth && dataVenda.getFullYear() === thisYear) {
        fin.esteMes.vendas += quantidade;
        fin.esteMes.receita += preco;
      }

      // Mês passado
      if (dataVenda.getMonth() === lastMonth && dataVenda.getFullYear() === lastMonthYear) {
        fin.mesPassado.vendas += quantidade;
        fin.mesPassado.receita += preco;
      }

      // Últimos 7 dias
      const dayKey = `${String(dataVenda.getDate()).padStart(2,'0')}/${String(dataVenda.getMonth()+1).padStart(2,'0')}`;
      if (dias7[dayKey]) {
        dias7[dayKey].receita += preco;
        dias7[dayKey].vendas += quantidade;
      }
    }

    fin.totalAtivo.clientes = clientesSet.size;
    fin.ultimos7Dias = Object.values(dias7);

    res.json({ success: true, financeiro: fin });
  } catch (err) {
    console.error('Erro GET /financeiro:', err.message);
    res.status(500).json({ error: 'Erro ao calcular financeiro' });
  }
});

// GET /api/admin/chat/:phone — histórico e estado completo de um cliente
adminRouter.get('/chat/:phone', (req, res) => {
  const phone = (req.params.phone || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
  const state = clientStates[phone] || null;
  if (!state) return res.status(404).json({ error: 'Sem sessão activa para este número.' });
  const history = (chatHistories[phone] || []).map(m => ({
    role: m.role,
    text: m.parts?.[0]?.text || '',
  }));
  res.json({
    phone,
    step: state.step || '—',
    clientName: state.clientName || '',
    isPaused: !!pausedClients[phone],
    cart: state.cart || [],
    totalValor: state.totalValor || 0,
    history,
    pending: pendingVerifications[phone] || null,
  });
});

// GET /api/admin/active-sessions — lista todas as sessões activas em memória
adminRouter.get('/active-sessions', (req, res) => {
  const sessions = Object.entries(clientStates).map(([phone, state]) => ({
    phone,
    step: state.step,
    clientName: state.clientName || '',
    lastActivity: state.lastActivity || null,
    isPaused: !!pausedClients[phone],
    hasPending: !!pendingVerifications[phone],
  }));
  sessions.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  res.json({ total: sessions.length, sessions });
});

// POST /api/admin/session/pausar — pausa o bot para um número via API
adminRouter.post('/session/pausar', (req, res) => {
  const phone = ((req.body.phone || '')).replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
  pausedClients[phone] = true;
  console.log(`[Admin API] Bot pausado para ${phone}`);
  res.json({ success: true, phone, isPaused: true });
});

// POST /api/admin/session/retomar — retoma o bot para um número via API
adminRouter.post('/session/retomar', (req, res) => {
  const phone = ((req.body.phone || '')).replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
  delete pausedClients[phone];
  console.log(`[Admin API] Bot retomado para ${phone}`);
  res.json({ success: true, phone, isPaused: false });
});

// POST /api/admin/broadcast — envia mensagem para lista de números
// Body: { numbers: ["244XXXXXXXXX", ...], message: "texto", delay_ms: 2000 }
adminRouter.post('/broadcast', async (req, res) => {
  const { numbers, message, delay_ms } = req.body;
  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Lista de números obrigatória.' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Mensagem obrigatória.' });
  }
  const delayBetween = parseInt(delay_ms, 10) || 2500;
  const MAX_NUMBERS = 500;
  const batch = numbers.slice(0, MAX_NUMBERS);

  let sent = 0, failed = 0;
  const results = [];
  for (const num of batch) {
    const clean = (num || '').toString().replace(/\D/g, '');
    if (!clean || clean.length < 9 || clean.length > 15) {
      failed++;
      results.push({ num: clean || num, status: 'invalid' });
      continue;
    }
    const result = await sendWhatsAppMessage(clean, message);
    if (result.sent) { sent++; results.push({ num: clean, status: 'sent' }); }
    else { failed++; results.push({ num: clean, status: result.invalidNumber ? 'no_whatsapp' : 'failed' }); }
    if (delayBetween > 0) await new Promise(r => setTimeout(r, delayBetween));
  }

  console.log(`📢 BROADCAST: ${sent} enviadas, ${failed} falharam (de ${batch.length})`);
  res.json({ success: true, sent, failed, total: batch.length, results });
});

// POST /api/admin/broadcast/expiracoes — broadcast de renovação filtrado por proximidade de expiração
// Body: { dias_ate?: number (default 7), delay_ms?: number, mensagem_custom?: string }
// Envia automaticamente o template correto a cada cliente com expiração <= dias_ate
adminRouter.post('/broadcast/expiracoes', async (req, res) => {
  const diasAte = parseInt(req.body.dias_ate, 10) || 7;
  const delayMs = parseInt(req.body.delay_ms, 10) || 3000;
  const mensagemCustom = (req.body.mensagem_custom || '').trim();

  // Fonte preferencial: Supabase; fallback: Google Sheet
  if (supabase) {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const msPerDay = 24 * 60 * 60 * 1000;
      const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + diasAte + 1);

      const { data: vendas, error } = await supabase
        .from('vendas')
        .select('plataforma, data_expiracao, clientes(nome, whatsapp)')
        .eq('status', 'ativo')
        .lte('data_expiracao', cutoff.toISOString());

      if (error) throw new Error(error.message);

      const targets = [];
      for (const v of (vendas || [])) {
        if (!v.data_expiracao) continue;
        const expiry = new Date(v.data_expiracao); expiry.setHours(0, 0, 0, 0);
        const diasRestantes = Math.round((expiry - today) / msPerDay);
        if (diasRestantes > diasAte) continue;
        const phone = ((v.clientes || {}).whatsapp || '').replace(/\D/g, '');
        if (!phone || phone.length < 9) continue;
        let estado;
        if (diasRestantes < 0)       estado = 'expirado';
        else if (diasRestantes <= 3) estado = 'urgente';
        else                         estado = 'aviso';
        targets.push({ phone, nome: (v.clientes || {}).nome || '', plataforma: v.plataforma || '', diasRestantes, estado });
      }

      if (targets.length === 0) return res.json({ success: true, sent: 0, failed: 0, total: 0, message: `Nenhum cliente com expiração em ≤ ${diasAte} dias.`, fonte: 'supabase' });

      let sent = 0, failed = 0;
      const results = [];
      for (const t of targets) {
        const msg = mensagemCustom
          ? mensagemCustom.replace('{nome}', t.nome).replace('{plataforma}', t.plataforma).replace('{dias}', String(t.diasRestantes))
          : t.diasRestantes >= 5
            ? `Olá ${t.nome}! 😊\n\nO teu plano 🎬 *${t.plataforma}* expira daqui a *7 dias*.\n\nAproveita para renovar com antecedência e continua a ver os teus filmes e séries favoritos sem interrupções 🍿\n\n👉 Renova aqui: ${branding.website}\n\nQualquer dúvida estamos aqui! 💬`
            : t.diasRestantes >= 1
              ? `${t.nome}, atenção! ⏰\n\nO teu plano 🎬 *${t.plataforma}* expira em apenas *${t.diasRestantes} dia(s)*.\n\nNão percas o acesso às tuas séries a meio — renova agora em menos de 2 minutos 😊\n\n💳 Renova aqui: ${branding.website}\n\nEstamos sempre disponíveis para ajudar! 🙌`
              : `${t.nome}, hoje é o último dia! 🚨\n\nO teu plano 🎬 *${t.plataforma}* expira *hoje*.\n\nRenova agora e continua a ver sem parar 🎬🍿\n\n🔗 ${branding.website}\n\nObrigado por escolheres a ${branding.nome}! ❤️`;
        const result = await sendWhatsAppMessage(t.phone, msg);
        if (result.sent) { sent++; results.push({ ...t, status: 'sent' }); }
        else { failed++; results.push({ ...t, status: 'failed' }); }
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      }
      console.log(`📢 BROADCAST EXPIRACOES (Supabase): ${sent} enviadas, ${failed} falharam (filtro: ≤${diasAte} dias)`);
      return res.json({ success: true, sent, failed, total: targets.length, results, fonte: 'supabase' });
    } catch (err) {
      console.error('Erro broadcast/expiracoes (Supabase):', err.message, '— a tentar fallback Sheet');
      // fall through to Sheet fallback
    }
  }

  // Fallback: Google Sheet
  try {
    const rows = await fetchAllRows();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;

    const targets = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma   = row[0] || '';
      const status       = row[5] || '';
      const cliente      = row[6] || '';  // G = Nome
      const phone        = (row[7] || '').toString().replace(/\D/g, '');  // H = Telefone
      const dataVendaStr = row[8] || '';  // I = Data_Venda

      if (!isIndisponivel(status) || !cliente || !dataVendaStr) continue;

      const parts = dataVendaStr.split('/');
      if (parts.length !== 3) continue;
      const dataVenda = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (isNaN(dataVenda.getTime())) continue;

      const expiry = new Date(dataVenda);
      expiry.setDate(expiry.getDate() + 30);
      expiry.setHours(0, 0, 0, 0);

      const diasRestantes = Math.round((expiry - today) / msPerDay);
      if (diasRestantes > diasAte) continue;

      const nome = cliente;

      if (!phone || phone.length < 9) continue;

      let estado;
      if (diasRestantes < 0)       estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else                          estado = 'aviso';

      targets.push({ phone, nome, plataforma, diasRestantes, estado });
    }

    if (targets.length === 0) {
      return res.json({ success: true, sent: 0, failed: 0, total: 0, message: `Nenhum cliente com expiração em ≤ ${diasAte} dias.` });
    }

    let sent = 0, failed = 0;
    const results = [];

    for (const t of targets) {
      let msg;
      if (mensagemCustom) {
        msg = mensagemCustom
          .replace('{nome}', t.nome)
          .replace('{plataforma}', t.plataforma)
          .replace('{dias}', String(t.diasRestantes));
      } else if (t.diasRestantes >= 5) {
        msg = `Olá ${t.nome}! 😊\n\nO teu plano 🎬 *${t.plataforma}* expira daqui a *7 dias*.\n\nAproveita para renovar com antecedência e continua a ver os teus filmes e séries favoritos sem interrupções 🍿\n\n👉 Renova aqui: ${branding.website}\n\nQualquer dúvida estamos aqui! 💬`;
      } else if (t.diasRestantes >= 1) {
        msg = `${t.nome}, atenção! ⏰\n\nO teu plano 🎬 *${t.plataforma}* expira em apenas *${t.diasRestantes} dia(s)*.\n\nNão percas o acesso às tuas séries a meio — renova agora em menos de 2 minutos 😊\n\n💳 Renova aqui: ${branding.website}\n\nEstamos sempre disponíveis para ajudar! 🙌`;
      } else {
        msg = `${t.nome}, hoje é o último dia! 🚨\n\nO teu plano 🎬 *${t.plataforma}* expira *hoje*.\n\nRenova agora e continua a ver sem parar 🎬🍿\n\n🔗 ${branding.website}\n\nObrigado por escolheres a ${branding.nome}! ❤️`;
      }

      const result = await sendWhatsAppMessage(t.phone, msg);
      if (result.sent) { sent++; results.push({ ...t, status: 'sent' }); }
      else { failed++; results.push({ ...t, status: 'failed' }); }
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    }

    console.log(`📢 BROADCAST EXPIRACOES: ${sent} enviadas, ${failed} falharam (filtro: ≤${diasAte} dias)`);
    res.json({ success: true, sent, failed, total: targets.length, results });
  } catch (err) {
    console.error('Erro broadcast/expiracoes:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/financeiro-db (Supabase — fallback para mensagem se não configurado)
adminRouter.get('/financeiro-db', async (req, res) => {
  if (!supabase) {
    return res.json({ success: false, message: 'Supabase não configurado' });
  }
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const lastMonthEnd   = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const sevenDaysAgo   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: todasVendas },
      { data: vendasHoje },
      { data: vendasMes },
      { data: vendasMesPassado },
      { data: vendasSemana },
      { data: clientesAtivos },
    ] = await Promise.all([
      supabase.from('vendas').select('valor_total, plataforma, quantidade').eq('status', 'ativo'),
      supabase.from('vendas').select('valor_total, quantidade').gte('data_venda', today.toISOString()).lt('data_venda', tomorrow.toISOString()),
      supabase.from('vendas').select('valor_total, quantidade').gte('data_venda', thisMonthStart).eq('status', 'ativo'),
      supabase.from('vendas').select('valor_total, quantidade').gte('data_venda', lastMonthStart).lt('data_venda', lastMonthEnd).eq('status', 'ativo'),
      supabase.from('vendas').select('valor_total, quantidade, data_venda, plataforma').gte('data_venda', sevenDaysAgo).eq('status', 'ativo'),
      supabase.from('vendas').select('cliente_id').eq('status', 'ativo'),
    ]);

    const sum = (arr) => (arr || []).reduce((s, r) => s + (r.valor_total || 0), 0);
    const cnt = (arr) => (arr || []).reduce((s, r) => s + (r.quantidade || 1), 0);

    // Últimos 7 dias agrupados por dia
    const dias7 = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      dias7[key] = { data: key, receita: 0, vendas: 0 };
    }
    (vendasSemana || []).forEach(v => {
      const d = new Date(v.data_venda);
      const key = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      if (dias7[key]) {
        dias7[key].receita += v.valor_total || 0;
        dias7[key].vendas  += v.quantidade || 1;
      }
    });

    // Por plataforma
    const porPlataforma = {};
    (todasVendas || []).forEach(v => {
      const p = v.plataforma || 'Outro';
      if (!porPlataforma[p]) porPlataforma[p] = { vendas: 0, receita: 0 };
      porPlataforma[p].vendas  += v.quantidade || 1;
      porPlataforma[p].receita += v.valor_total || 0;
    });

    res.json({
      success: true,
      fonte: 'supabase',
      financeiro: {
        hoje:       { vendas: cnt(vendasHoje),       receita: sum(vendasHoje) },
        esteMes:    { vendas: cnt(vendasMes),         receita: sum(vendasMes) },
        mesPassado: { vendas: cnt(vendasMesPassado),  receita: sum(vendasMesPassado) },
        totalAtivo: { clientes: new Set((clientesAtivos || []).map(r => r.cliente_id)).size, receita: sum(todasVendas) },
        porPlataforma,
        ultimos7Dias: Object.values(dias7),
      },
    });
  } catch (err) {
    console.error('Erro GET /financeiro-db:', err.message);
    res.status(500).json({ error: 'Erro ao calcular financeiro via Supabase' });
  }
});

app.get('/api/branding', (req, res) => {
  res.json(branding);
});

app.get('/api/version', (req, res) => {
  res.json({ v: '20260224-gemini-flash-fix', started: new Date().toISOString() });
});

app.use('/api/admin', adminRouter);

// Scheduler de expiração — avisos automáticos às 9h
require('./expiracao-modulo').iniciar({
  sendWhatsAppMessage,
  MAIN_BOSS,
  branding,
  fetchAllRows,
  markProfileAvailable,
  isIndisponivel,
});

// Restaurar sessões activas do Supabase antes de começar a aceitar mensagens
loadSessionsOnStartup().then(() => {
  app.listen(port, '0.0.0.0', () => console.log(`Bot v17.0 (${branding.nome}) rodando na porta ${port}`));
});
