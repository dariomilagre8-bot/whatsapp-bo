// handleWebhook — corpo completo do POST / (Evolution API messages.upsert)
const { cleanNumber } = require('../../googleSheets');
const config = require('../config');
const estados = require('../utils/estados');
const { shouldSendIntro, markIntroSent } = require('../utils/loops');
const { sendWhatsAppMessage, sendPaymentMessages, sendCredentialsEmail } = require('../whatsapp');
const notif = require('../utils/notificacoes');
const { buildServiceMenuMsg } = require('../fluxo/catalogo');
const escalacaoHandler = require('../handlers/escalacao');
const imagensHandler = require('../handlers/imagens');
const supervisorHandler = require('../handlers/supervisor');
const {
  checkClientInSheet,
  findAvailableProfiles,
  countAvailableProfiles,
  hasAnyStock,
  findClientByName,
  updateClientPhone,
  findClientProfiles,
} = require('../../googleSheets');
const branding = require('../../branding');
const {
  verificarRespostaFixa,
  getCategoriaRespostaFixa,
  getRespostaPrecosSeSemPlano,
  RESPOSTA_SEM_STOCK_NETFLIX_CROSSSELL,
  RESPOSTA_COMPROVATIVO_RECEBIDO,
  RESPOSTA_FECHO_IBAN,
  CATEGORIAS,
  CATEGORIAS_ESCALAR_URGENTE,
  CATEGORIAS_ESCALAR_NORMAL,
  CATEGORIAS_PAUSAR_BOT,
  RESPOSTA_IMAGEM_FORA_CONTEXTO,
} = require('../respostas-fixas');
const { obterSessao, adicionarMensagem } = require('../agent/memoria-db');
const { processarComprativo } = require('../services/storage');
const { processarAudio } = require('../services/audio');
const clienteLookup = require('../cliente-lookup');
const { validarRespostaZara } = require('../validar-resposta');
const { runWithInstance } = require('../evolution-instance-context');
const { extrairNome, mensagemFechoConsolidada } = require('../funil-zara');

const {
  genAI,
  MAIN_BOSS,
  CATALOGO,
  PLAN_SLOTS,
  PLAN_RANK,
  PLAN_PROFILE_TYPE,
  BOT_NAME,
  removeAccents,
  formatPriceTable,
  planChoicesText,
  findPlan,
  detectServices,
  detectQuantity,
  detectClientType,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_COMPROVATIVO,
  RESPOSTAS_FIXAS,
  RESPOSTAS_TEXTO,
} = config;

const { clientStates, pendingVerifications, pausedClients, initClientState, markDirty, cleanupSession, getContextoCliente } = estados;
const { logLostSale } = notif;

// Memórias leves (substitui memoria-local.js sem Map())
const _mem = {
  globalPaused: false,
  pausados: Object.create(null), // phone -> true
  saudacao: Object.create(null), // phone -> expiresAtMs
  reembolso: Object.create(null), // phone -> { count, expiresAtMs }
};

function _nowMs() { return Date.now(); }
function _isExpiredMs(expiresAtMs) { return expiresAtMs != null && _nowMs() >= expiresAtMs; }
function _saudacaoJaEnviada(phone) {
  const exp = _mem.saudacao[phone];
  if (!exp) return false;
  if (_isExpiredMs(exp)) { delete _mem.saudacao[phone]; return false; }
  return true;
}
function _marcarSaudacao(phone, ttlMs) {
  _mem.saudacao[phone] = _nowMs() + ttlMs;
}
function _isPausado(phone) {
  return !!_mem.globalPaused || !!_mem.pausados[phone] || !!pausedClients[phone];
}
function _pausar(phone) {
  _mem.pausados[phone] = true;
  pausedClients[phone] = true;
}
function _retomar(phone) {
  delete _mem.pausados[phone];
  delete pausedClients[phone];
}
function _incrReembolso(phone, ttlMs) {
  const entry = _mem.reembolso[phone];
  if (!entry || _isExpiredMs(entry.expiresAtMs)) {
    _mem.reembolso[phone] = { count: 1, expiresAtMs: _nowMs() + ttlMs };
    return 1;
  }
  entry.count += 1;
  entry.expiresAtMs = _nowMs() + ttlMs;
  return entry.count;
}

/** [CPA] Fecho em 1 única mensagem quando um único item; senão envia resumo + dados (compatível com multi-item). */
async function enviarFechoConsolidado(senderNum, state) {
  if (state.cart && state.cart.length === 1) {
    const item = state.cart[0];
    const planSlots = PLAN_SLOTS[item.plan] || 1;
    const msg = mensagemFechoConsolidada({
      plataforma: item.plataforma,
      plano: item.plan,
      valor: item.totalPrice || item.price || 0,
      dispositivos: planSlots,
    });
    await sendWhatsAppMessage(senderNum, msg);
  } else {
    await sendPaymentMessages(senderNum, state);
  }
}

const FEW_SHOT_EXAMPLES = [
  { role: 'user',  parts: [{ text: 'Está caro' }] },
  { role: 'model', parts: [{ text: '3.000 Kz dá para 31 dias de Prime Video sem interrupções. É menos de 100 Kz por dia — menos que um refrigerante. Queres experimentar este mês? 😊' }] },
  { role: 'user',  parts: [{ text: 'Vou pensar' }] },
  { role: 'model', parts: [{ text: 'Claro! Só aviso que os slots esgotam rápido — temos poucos perfis disponíveis agora. Queres que te reserve um por 24h? 😊' }] },
  { role: 'user',  parts: [{ text: 'É de confiança?' }] },
  { role: 'model', parts: [{ text: 'Somos angolanos a vender para angolanos 🇦🇴 Já temos clientes activos este mês. Após o pagamento recebes os dados em minutos.' }] },
  { role: 'user',  parts: [{ text: 'Não tenho dinheiro agora' }] },
  { role: 'model', parts: [{ text: 'Sem problema! Quando quiseres estamos aqui. Posso enviar-te um lembrete amanhã? 😊' }] },
];

async function interceptarMensagem(texto, state, stockInfoObj, senderNum) {
  if (!texto) return null;
  const plano = (state.plataforma && state.plano)
    ? `${state.plataforma} ${state.plano}`
    : (state.plataforma || 'Prime Video Individual');
  const preco = state.valor || 3000;
  const diasRestantes = state.daysRemaining || 0;

  for (const [tipo, padroes] of Object.entries(RESPOSTAS_FIXAS)) {
    if (!Array.isArray(padroes)) continue;
    if (!padroes.some(p => p.test(texto))) continue;

    if (!state.objeccoes) state.objeccoes = [];
    if (['preco', 'saida', 'confianca'].includes(tipo) && state.objeccoes.includes(tipo)) {
      return { tipo, resposta: null, escalar: true };
    }
    if (!state.objeccoes.includes(tipo)) state.objeccoes.push(tipo);

    switch (tipo) {
      case 'preco':          return { tipo, resposta: RESPOSTAS_TEXTO.preco(plano, preco) };
      case 'saida':          return { tipo, resposta: RESPOSTAS_TEXTO.saida() };
      case 'confianca':      return { tipo, resposta: RESPOSTAS_TEXTO.confianca() };
      case 'ja_tem':         return { tipo, resposta: RESPOSTAS_TEXTO.ja_tem() };
      case 'stock_esgotado_netflix': return { tipo, resposta: RESPOSTAS_TEXTO.stock_esgotado_netflix((stockInfoObj.prime || 0) > 0) };
      case 'localizacao':    return { tipo, resposta: RESPOSTAS_TEXTO.localizacao() };
      case 'email_senha':    return { tipo, resposta: RESPOSTAS_TEXTO.email_senha(), reenviarCredenciais: true };
      case 'renovacao':      return { tipo, resposta: RESPOSTAS_TEXTO.renovacao(diasRestantes) };

      case 'nao_entra': {
        const ctx = state.contextoCliente || (senderNum ? await getContextoCliente(senderNum) : null);
        if (ctx) state.contextoCliente = ctx;
        if (!ctx || !ctx.existe || !ctx.venda) {
          return { tipo, resposta: `Não encontrei conta activa com este número.\nJá fizeste compra connosco? Se sim envia o número com que compraste. 😊` };
        }
        if (ctx.expirou) {
          return { tipo, resposta: `O teu plano expirou há ${Math.abs(ctx.diasRestantes)} dias.\nPara resolver: renova o plano. Queres? 😊` };
        }
        return {
          tipo,
          resposta: `Vou resolver isso agora 🔧\nQual é o erro exacto que aparece no ecrã?`,
          pausar: true,
          msgSupervisor: formatarNotificacaoSupervisor(senderNum, ctx, `🔴 PROBLEMA TÉCNICO\nMensagem: "${texto}"\nAcção: assumir conversa`),
        };
      }

      case 'pin': {
        const ctx = state.contextoCliente || (senderNum ? await getContextoCliente(senderNum) : null);
        if (ctx) state.contextoCliente = ctx;
        if (ctx?.credsValidas && ctx.perfis?.length > 0) {
          const pin = ctx.perfis[0].pin;
          if (pin) return { tipo, resposta: `O PIN do teu perfil é: ${pin}\nSe não funcionar avisa-me! 😊` };
          return { tipo, resposta: `O teu perfil não tem PIN configurado.\nPara criar: Perfil → Editar → Bloqueio por PIN. 😊` };
        }
        return {
          tipo,
          resposta: `Vou verificar o PIN do teu perfil. Um momento... 🔧`,
          pausar: true,
          msgSupervisor: formatarNotificacaoSupervisor(senderNum, ctx, `🔴 PIN — verificar e responder ao cliente`),
        };
      }

      case 'cancelamento':
        return {
          tipo,
          resposta: RESPOSTAS_TEXTO.cancelamento(),
          pausar: true,
          msgSupervisor: formatarNotificacaoSupervisor(senderNum, state.contextoCliente, `🔴 PEDIDO DE CANCELAMENTO`),
        };

      case 'upgrade': {
        const planoActual = state.contextoCliente?.venda
          ? `${state.contextoCliente.venda.plataforma} ${state.contextoCliente.venda.plano}`
          : 'plano actual';
        return {
          tipo,
          resposta: RESPOSTAS_TEXTO.upgrade(planoActual),
          pausar: true,
          msgSupervisor: formatarNotificacaoSupervisor(senderNum, state.contextoCliente, `ℹ️ PEDIDO DE UPGRADE`),
        };
      }
    }
  }
  return null;
}

function formatarNotificacaoSupervisor(phone, ctx, tipo) {
  const base = ctx?.cliente
    ? `👤 ${ctx.cliente.nome || phone}\n📦 ${ctx.venda?.plataforma || ''} ${ctx.venda?.plano || 'sem plano'}\n📅 ${ctx.diasRestantes !== null && ctx.diasRestantes !== undefined ? ctx.diasRestantes + ' dias restantes' : 'sem data'}\n`
    : `📞 ${phone}\n`;
  return `${base}${tipo}`;
}

/** [CPA] Label em linguagem simples para notificação de suporte StreamZone */
function problemaLabelSuporte(categoria) {
  const map = {
    codigo_verificacao: 'Código de verificação',
    senha_errada: 'Senha errada / mudou',
    paguei_sem_resposta: 'Paguei mas não recebi dados',
  };
  return map[categoria] || categoria;
}

/** [CPA] Tratamento formal: Caríssima/Caríssimo pelo nome (género por sufixo comum) */
function tratamentoFormal(nome) {
  if (!nome || typeof nome !== 'string') return 'Caríssimo(a)';
  const n = nome.trim();
  if (!n) return 'Caríssimo(a)';
  const lower = n.toLowerCase();
  if (/\b(a|inda|iva|ana|ia|ea|da|ra)$/.test(lower) || lower.endsWith('a')) return `Caríssima ${n}`;
  return `Caríssimo ${n}`;
}

/** [CPA] Formato notificação ao supervisor (respostas fixas Zara) */
function formatarNotificacaoSuporteStreamzone(nomeCliente, numero, problema, ultimaMensagem, urgente) {
  const tag = urgente ? '[🔴 URGENTE]' : '[📋 Info]';
  return `📱 SUPORTE STREAMZONE

Cliente: ${nomeCliente || '—'}
Número: ${numero}
Problema: ${problema}
Mensagem: "${(ultimaMensagem || '').substring(0, 200)}"

${tag}`;
}

async function reenviarCredenciais(senderNum, state) {
  const ctx = await getContextoCliente(senderNum);

  // Conta expirada
  if (ctx.existe && ctx.expirou) {
    await sendWhatsAppMessage(senderNum,
      `O seu plano ${ctx.venda?.plano || ''} expirou há ${Math.abs(ctx.diasRestantes)} dias 😔\nGostaria de renovar? É rápido — mesmo plano, mesmo preço. 😊`);
    return;
  }

  // Tenta credenciais do Supabase (perfis_entregues)
  if (ctx.credsValidas && ctx.perfis?.length > 0) {
    const nome = ctx.cliente?.nome || '';
    for (const perfil of ctx.perfis) {
      const emoji = (perfil.plataforma || '').toLowerCase().includes('netflix') ? '🎬' : '📺';
      let msg = `${emoji} ${perfil.plataforma || 'Credenciais'}\n\nEmail: ${perfil.email_conta}\nSenha: ${perfil.senha_conta}`;
      if (perfil.nome_perfil) msg += `\nPerfil: ${perfil.nome_perfil}`;
      if (perfil.pin) msg += `\nPIN: ${perfil.pin}`;
      await sendWhatsAppMessage(senderNum, msg);
    }
    await sendWhatsAppMessage(senderNum, `Guarda bem estes dados${nome ? ', ' + nome : ''}! Algum problema? Estou aqui. 😊`);
    if (ctx.cliente?.email) {
      const allCreds = ctx.perfis.map(p => ({ email: p.email_conta, senha: p.senha_conta, nomePerfil: p.nome_perfil || '', pin: p.pin || '', unitLabel: '' }));
      const productName = [...new Set(ctx.perfis.map(p => p.plataforma))].join(', ');
      await sendCredentialsEmail(ctx.cliente.email, nome || 'Cliente', productName, allCreds).catch(() => {});
    }
    return;
  }

  // Fallback: Google Sheets
  const profiles = await findClientProfiles(senderNum).catch(() => null);
  if (profiles && profiles.length > 0) {
    const byPlat = {};
    for (const p of profiles) {
      const key = p.plataforma || 'Serviço';
      if (!byPlat[key]) byPlat[key] = [];
      byPlat[key].push(p);
    }
    for (const [plataforma, profs] of Object.entries(byPlat)) {
      const emoji = plataforma.toLowerCase().includes('netflix') ? '🎬' : '📺';
      let msg = `${emoji} ${plataforma}`;
      for (let i = 0; i < profs.length; i++) {
        msg += `\n\nPerfil ${i + 1}: ${profs[i].email} | ${profs[i].senha}`;
        if (profs[i].nomePerfil) msg += ` | ${profs[i].nomePerfil}`;
        if (profs[i].pin) msg += ` | PIN: ${profs[i].pin}`;
      }
      await sendWhatsAppMessage(senderNum, msg);
    }
    await sendWhatsAppMessage(senderNum, `Guarda bem estes dados! Se precisares de mais ajuda estou aqui. 😊`);
    return;
  }

  // Sem credenciais encontradas
  await sendWhatsAppMessage(senderNum,
    `Não encontrei compra activa com este número 😔\nComprou com outro número? Envie-o e verifico.\nOu posso passá-lo(a) para o responsável.`);
  if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS,
    formatarNotificacaoSupervisor(senderNum, ctx, `⚠️ REENVIO CREDENCIAIS — não encontradas\nAcção: verificar e enviar manualmente`));
}

function validarResposta(texto) {
  const INVALIDAS = [
    /^oh\??[.!]?$/i, /^ok[.!]?$/i, /^sim[.!]?$/i,
    /^compreendo[.!]?$/i, /^entendo[.!]?$/i,
    /^certo[.!]?$/i, /^claro[.!]?$/i, /^\s*$/,
    /^compreendo\s*\w*[.!]?$/i,
    /^olá[,.]?\s*confirmamos/i,
  ];
  if (INVALIDAS.some(p => p.test(texto.trim()))) {
    return `Estou aqui para ajudá-lo(a)! Tem alguma dúvida sobre os nossos planos? 😊`;
  }
  if (texto.trim().length < 15) {
    return `Podes dar-me mais detalhes? Quero garantir que te ajudo correctamente. 😊`;
  }
  return texto;
}

const CHANGE_MIND_PATTERNS = /\b(mudei de ideias|mudei de ideia|quero outro|quero outra|cancela|cancelar|desistir|trocar|mudar de plano|quero mudar|outro plano|comecar de novo|começar de novo|recomeçar|recomecar)\b/i;

const EXIT_INTENT_PATTERNS = [
  /vou pensar/i,
  /deixa estar/i,
  /talvez depois/i,
  /não preciso/i,
  /nao preciso/i,
  /esquece/i,
  /cancel/i,
];

const SALE_STEPS_FOR_EXIT_INTENT = ['escolha_servico', 'escolha_plano', 'resumo_pedido', 'aguardando_reposicao', 'aguardando_resposta_alternativa'];
const FIVE_MIN_MS = 5 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

function isExitIntent(text) {
  return EXIT_INTENT_PATTERNS.some(p => p.test(text || ''));
}

function detectObjectionKey(text) {
  if (!text) return null;
  const t = removeAccents(text.toLowerCase());
  if (/\b(caro|muito caro|est[aá] caro|carissimo)\b/.test(t)) return 'preco';
  if (/\b(n[aã]o conheço|nao conheco|confian[cç]a|de confian[cç]a|é confi[aá]vel)\b/.test(t)) return 'confianca';
  if (/\b(tenho netflix|j[aá] tenho|já tenho)\b/.test(t)) return 'ja_tem';
  if (/\b(vou pensar|deixa estar|talvez depois)\b/.test(t)) return 'vou_pensar';
  if (/\b(n[aã]o tenho dinheiro|sem dinheiro|não posso agora)\b/.test(t)) return 'sem_dinheiro';
  return null;
}

function handleChangeMind(senderNum, state, textMessage) {
  const normalizedText = removeAccents(textMessage.toLowerCase());
  if (!CHANGE_MIND_PATTERNS.test(normalizedText)) return false;
  if (state.step === 'inicio' || state.step === 'captura_nome') return false;
  if (state.step === 'esperando_supervisor') return false;
  const savedName = state.clientName;
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
  delete state.pendingRecovery;
  delete state.recovery30minSent;
  delete state.supervisorResponded;
  return true;
}

/** [CPA] Comandos do supervisor: #pausar, #retomar, #status, #pausar todos, #retomar todos */
async function processarComandoSupervisor(comando, supervisorPhone) {
  const partes = comando.split(/\s+/);
  const accao = (partes[0] || '').toLowerCase();
  const alvo = partes[1];

  if (accao === '#pausar' && alvo === 'todos') {
    _mem.globalPaused = true;
    await sendWhatsAppMessage(supervisorPhone, '✅ Bot pausado para todos. Modo manutenção activo.');
    return;
  }
  if (accao === '#pausar' && alvo) {
    const num = String(alvo || '').replace(/\D/g, '') || alvo;
    if (num) {
      _pausar(num);
      await sendWhatsAppMessage(supervisorPhone, `✅ Bot pausado para ${num}. Tu assumes a conversa.`);
    }
    return;
  }
  if (accao === '#retomar' && alvo === 'todos') {
    _mem.globalPaused = false;
    await sendWhatsAppMessage(supervisorPhone, '✅ Bot reactivado para todos.');
    return;
  }
  if (accao === '#retomar' && alvo) {
    const num = String(alvo || '').replace(/\D/g, '') || alvo;
    if (num) {
      _retomar(num);
      await sendWhatsAppMessage(supervisorPhone, `✅ Bot reactivado para ${num}.`);
    }
    return;
  }
  if (accao === '#status' && alvo) {
    const num = String(alvo || '').replace(/\D/g, '') || alvo;
    if (num) {
      const pausado = _isPausado(num);
      const estado = pausado ? 'pausado' : 'activo';
      const state = clientStates[num];
      let extra = '';
      if (state && state.plataforma && state.plano) extra = `\nPlano: ${state.plataforma} ${state.plano}`;
      if (state && state.contextoClienteStr) {
        const vendas = await clienteLookup.buscarVendasDoCliente(num).catch(() => []);
        const v = vendas.find(x => x.status === 'ativo' && x.diasRestantes != null && x.diasRestantes > 0);
        if (v) extra += `\nDias restantes: ${v.diasRestantes}`;
      }
      await sendWhatsAppMessage(supervisorPhone, `📋 ${num} — Bot ${estado}${extra}`);
    }
    return;
  }
  if (accao === '#stock') {
    try {
      const [nfInd, nfPart, pvInd, pvPart] = await Promise.all([
        countAvailableProfiles('Netflix', 'full_account').catch(() => 0),
        countAvailableProfiles('Netflix', 'shared_profile').catch(() => 0),
        countAvailableProfiles('Prime Video', 'full_account').catch(() => 0),
        countAvailableProfiles('Prime Video', 'shared_profile').catch(() => 0),
      ]);
      const msg = `📊 STOCK STREAMZONE
🎬 Netflix:
  Individual: ${nfInd} disponíveis
  Partilhado: ${nfPart} disponíveis
  Família: ${nfPart} disponíveis
📺 Prime Video:
  Individual: ${pvInd} disponíveis
  Partilhado: ${pvPart} disponíveis
  Família: ${pvPart} disponíveis`;
      await sendWhatsAppMessage(supervisorPhone, msg);
    } catch (e) {
      await sendWhatsAppMessage(supervisorPhone, `❌ Erro ao consultar stock: ${e.message}`);
    }
    return;
  }
  if (accao === '#cliente' && alvo) {
    const num = String(alvo || '').replace(/\D/g, '') || alvo;
    if (num) {
      try {
        const dados = await clienteLookup.buscarClientePorWhatsapp(num);
        const vendas = await clienteLookup.buscarVendasDoCliente(num);
        const nome = (dados && dados.nome) ? dados.nome : '—';
        const vendaActiva = vendas.find(v => v.status === 'ativo' && v.diasRestantes != null && v.diasRestantes > 0);
        const plano = vendaActiva ? `${vendaActiva.plataforma} ${vendaActiva.plano}` : '—';
        const dias = vendaActiva && vendaActiva.diasRestantes != null ? vendaActiva.diasRestantes : '—';
        const msg = `👤 CLIENTE: ${nome}
📞 ${num}
🎬 Plano: ${plano}
📅 Expira em: ${dias} dias
💰 Total compras: ${vendas.length}`;
        await sendWhatsAppMessage(supervisorPhone, msg);
      } catch (e) {
        await sendWhatsAppMessage(supervisorPhone, `❌ Erro: ${e.message}`);
      }
    }
    return;
  }
  if (accao === '#ajuda') {
    await sendWhatsAppMessage(
      supervisorPhone,
      '❓ *Comandos disponíveis:*\n#pausar [número] — parar bot\n#retomar [número] — reactivar bot\n#status [número] — estado + plano\n#pausar todos — manutenção\n#retomar todos — reactivar tudo\n#stock — stock Netflix/Prime\n#cliente [número] — dados do cliente\n#ajuda — esta lista'
    );
    return;
  }
  await sendWhatsAppMessage(
    supervisorPhone,
    '❓ Comandos disponíveis:\n#pausar [número] — parar bot para este contacto\n#retomar [número] — reactivar bot\n#status [número] — ver estado\n#pausar todos — modo manutenção\n#retomar todos — reactivar tudo\n#stock — ver stock\n#cliente [número] — dados cliente\n#ajuda — listar comandos'
  );
}

// Nomes de instâncias aceites (vazio = aceitar qualquer). Ex: "Streamzone Braulio,Zara-Teste"
function getAllowedInstances() {
  const raw = process.env.EVOLUTION_ALLOWED_INSTANCES || '';
  if (!raw.trim()) return null;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// Extrai o nome da instância do payload (Evolution API v2 pode enviar em vários sítios)
function getInstanceFromBody(body) {
  return body.instance || body.instanceName || body.data?.instance || body.data?.instanceName || null;
}

async function handleWebhook(req, res) {
  try {
    const body = req.body;
    if (body.event !== 'messages.upsert') return res.status(200).send('OK');
    const messageData = body.data;
    if (messageData.key.fromMe) return res.status(200).send('Ignore self');

    const incomingInstance = getInstanceFromBody(body);
    const allowed = getAllowedInstances();
    if (allowed && allowed.length > 0) {
      const allowedSet = new Set(allowed);
      if (incomingInstance && !allowedSet.has(incomingInstance)) {
        console.log(`[webhook] Instância "${incomingInstance}" não está em EVOLUTION_ALLOWED_INSTANCES — ignorar`);
        return res.status(200).send('OK');
      }
      if (!incomingInstance) {
        console.log('[webhook] Payload sem nome de instância — usar instância default do env');
      }
    }

    const instanceToUse = incomingInstance || process.env.EVOLUTION_INSTANCE_NAME || null;

    return await runWithInstance(instanceToUse, async () => {
      return await handleWebhookInner(req, res, body, messageData);
    });
  } catch (err) {
    console.error('[webhook] Erro:', err);
    return res.status(500).send('Error');
  }
}

async function handleWebhookInner(req, res, body, messageData) {
  try {
    const remoteJid = messageData.key.remoteJid;
    const senderPn = messageData.key.senderPn || '';
    const rawJid = cleanNumber(remoteJid);
    const realPhone = senderPn ? cleanNumber(senderPn) : rawJid;
    const senderNum = realPhone;
    const lidId = remoteJid.includes('@lid') ? rawJid : null;

    const pushName = messageData.pushName || '';
    let textMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || messageData.message?.imageMessage?.caption || messageData.message?.documentMessage?.caption || '';
    const docMsg = messageData.message?.documentMessage;
    const docMime = (docMsg?.mimetype || '').toLowerCase();
    const docFilename = (docMsg?.fileName || '').toLowerCase();
    const isPdf = docMsg && (docMime.includes('pdf') || docFilename.endsWith('.pdf'));
    const isDoc = !!docMsg;
    const isImage = !!messageData.message?.imageMessage;
    const isAudio = !!messageData.message?.audioMessage || !!messageData.message?.pttMessage;

    const quotedMessage = messageData.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text || '';

    // Pipeline de Áudio: transcreve e trata como mensagem escrita
    if (isAudio) {
      try {
        const textoAudio = await processarAudio(messageData);
        textMessage = (textoAudio || '').trim();
      } catch (e) {
        console.error('[webhook] Falha na transcrição de áudio:', e.message);
        textMessage = '';
      }

      // Protecção: Se o áudio falhou ou não tem base64, não deixa a IA alucinar
      if (!textMessage) {
        await sendWhatsAppMessage(senderNum, "Desculpe, não consegui ouvir o seu áudio (formato não suportado). Pode escrever a sua mensagem por favor? ✍️");
        return res.status(200).send('OK');
      }
    }

    console.log(`📩 De: ${senderNum} (${pushName}) | Msg: ${textMessage}${isAudio ? ' [Áudio→Texto]' : ''}${lidId ? ` [LID: ${lidId}]` : ''}${quotedText ? ` [Quoted: ${quotedText.substring(0, 50)}...]` : ''}`);

    // [CPA] BLOCO 1 — Comandos do supervisor com # (apenas para BOSS/SUPERVISOR)
    const textoTrimmed = (textMessage || '').trim();
    if (textoTrimmed.startsWith('#') && supervisorHandler.isSupervisor(senderNum)) {
      await processarComandoSupervisor(textoTrimmed, senderNum);
      return res.status(200).send('OK');
    }

    if (await supervisorHandler.handleSupervisorCommand(res, senderNum, textMessage, quotedText)) return;

    console.log(`🔍 DEBUG: senderNum="${senderNum}" length=${senderNum.length}`);
    if (senderNum.length < 9 || senderNum.length > 15) {
      console.log(`🚫 DEBUG: Número inválido (length=${senderNum.length})`);
      return res.status(200).send('OK');
    }

    // [CPA] BLOCO 2 — Bot pausado → silêncio
    if (_isPausado(senderNum)) {
      console.log(`[CPA] Bot pausado para ${senderNum} — não responde`);
      return res.status(200).send('OK');
    }

    if (!clientStates[senderNum]) clientStates[senderNum] = initClientState();
    const state = clientStates[senderNum];
    state.lastActivity = Date.now();
    markDirty(senderNum);
    console.log(`🔍 DEBUG: step="${state.step}" para ${senderNum}`);

    // Memória persistente: carregar histórico + última plataforma (Supabase)
    let chatHistory = [];
    try {
      const sessao = await obterSessao(senderNum);
      chatHistory = Array.isArray(sessao?.contexto) ? sessao.contexto : [];
      if (!state.ultimaPlataforma && sessao?.ultimaPlataforma) state.ultimaPlataforma = sessao.ultimaPlataforma;
    } catch (_) {}

    // Pipeline de Anexos (Imagens/Docs): Triagem de Comprovativos vs Prints de Suporte
    if (isImage || isDoc) {
      try {
        const { url } = await processarComprativo(messageData);
        const nomeOuNum = (state.clientName || pushName || senderNum).toString().trim() || senderNum;

        // Lógica de Triagem: É compra ou suporte?
        // Se tem itens no carrinho, está no step de comprovativo, ou a legenda fala em pagamento.
        const textoLegenda = textMessage.toLowerCase();
        const isFluxoCompra = state.step === 'aguardando_comprovativo' ||
                              (state.cart && state.cart.length > 0) ||
                              textoLegenda.includes('pago') ||
                              textoLegenda.includes('comprovativo') ||
                              textoLegenda.includes('transfer');

        if (isFluxoCompra) {
          await sendWhatsAppMessage(senderNum, RESPOSTA_COMPROVATIVO_RECEBIDO);
          if (MAIN_BOSS) {
            const contextoPedido = (state.cart && state.cart.length > 0)
              ? state.cart.map(i => `${(i.quantity || 1) > 1 ? (i.quantity + 'x ') : ''}${i.plataforma} ${i.plan}`).join(' | ')
              : (state.plataforma && state.plano ? `${state.plataforma} ${state.plano}` : '—');
            await sendWhatsAppMessage(
              MAIN_BOSS,
              `💰 *COMPROVATIVO RECEBIDO*\n👤 ${nomeOuNum}\n📞 ${senderNum}\n📦 Pedido: ${contextoPedido}\n🔗 URL: ${url}\n\nBot pausado. Use *#retomar ${senderNum}* quando terminar.`
            );
          }
        } else {
          // É um print de erro (Suporte Técnico)
          await sendWhatsAppMessage(senderNum, "📸 Recebi a sua imagem. Se for um erro de acesso à plataforma, fique descansado(a) que já encaminhei para a equipa técnica analisar!");
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(
              MAIN_BOSS,
              `🛠️ *TICKET DE SUPORTE (Print/Anexo)*\n👤 ${nomeOuNum}\n📞 ${senderNum}\n🔗 URL: ${url}\n💬 Legenda: ${textMessage || 'Sem legenda'}\n\nBot pausado. Use *#retomar ${senderNum}* para responder ao erro.`
            );
          }
        }
        _pausar(senderNum);
      } catch (e) {
        console.error('[webhook] Erro no upload do anexo:', e.message);
        await sendWhatsAppMessage(senderNum, "📸 Recebi a sua imagem, mas houve um erro interno ao processar. O responsável já foi notificado.");
        if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `⚠️ Upload de anexo falhou\nCliente: ${senderNum}\nMotivo: ${e.message}`);
        _pausar(senderNum);
      }
      return res.status(200).send('OK');
    }

    // [CPA] Contexto do cliente — consultar dados reais (uma vez por mensagem)
    let dadosCliente = null;
    let vendasCliente = [];
    try {
      dadosCliente = await clienteLookup.buscarClientePorWhatsapp(senderNum);
      vendasCliente = await clienteLookup.buscarVendasDoCliente(senderNum);
    } catch (e) {
      console.error('[webhook] cliente lookup:', e.message);
    }
    let contextoCliente = '';
    if (dadosCliente && dadosCliente.ehAntigo) {
      contextoCliente += `CLIENTE EXISTENTE: ${(dadosCliente.nome || '').trim() || 'Cliente'}.\n`;
      if (vendasCliente && vendasCliente.length > 0) {
        const vendaActiva = vendasCliente.find(v => v.status === 'ativo' && v.diasRestantes != null && v.diasRestantes > 0);
        if (vendaActiva) {
          contextoCliente += `Plano activo: ${vendaActiva.plataforma} ${vendaActiva.plano}, expira em ${vendaActiva.diasRestantes} dias.\n`;
        }
        contextoCliente += `Total de compras: ${vendasCliente.length}.\n`;
      }
    } else {
      contextoCliente += `CLIENTE NOVO: primeira vez que contacta.\n`;
    }
    state.contextoClienteStr = contextoCliente;

    const depsEscalacao = { pausedClients, markDirty, sendWhatsAppMessage, MAIN_BOSS, checkClientInSheet, branding };
    if (textMessage && (await escalacaoHandler.handleHumanTransfer(depsEscalacao, senderNum, state, textMessage))) return res.status(200).send('OK');
    if (textMessage && (await escalacaoHandler.handleEscalacao(depsEscalacao, senderNum, state, textMessage, pushName))) return res.status(200).send('OK');
    if (textMessage && (await escalacaoHandler.handleLocationIssue(depsEscalacao, senderNum, state, textMessage))) return res.status(200).send('OK');

    // [CPA P5] Resposta "Sim" após cross-sell Netflix→Prime: assumir contexto Prime e enviar preços
    if (textMessage && state.aguardandoCrossSellPrime && /^(sim|quero|gostaria|yes|ok|claro|pode ser|envia|manda|por favor)$/i.test(textMessage.trim())) {
      const primeDisponivel = await hasAnyStock('Prime Video');
      if (primeDisponivel) {
        state.aguardandoCrossSellPrime = false;
        state.serviceKey = 'prime_video';
        state.plataforma = 'Prime Video';
        state.ultimaPlataforma = 'prime';
        state.step = 'escolha_plano';
        state.interestStack = ['prime_video'];
        state.currentItemIndex = 0;
        const catPrime = CATEGORIAS.find(c => c.id === 'precos_prime');
        await sendWhatsAppMessage(senderNum, catPrime ? catPrime.resposta : `📺 Prime Video:\n\n• Individual — 3.000 Kz/mês\n• Partilhado — 5.500 Kz/mês\n• Família — 8.000 Kz/mês\n\nQual lhe interessa?`);
        return res.status(200).send('OK');
      }
      state.aguardandoCrossSellPrime = false;
    }

    // [CPA] Respostas fixas Zara — prioridade sobre IA; stock dinâmico: se 0, deixa IA responder
    let netflixSlots = 0;
    let primeSlots = 0;
    if (textMessage && textMessage.trim()) {
      try {
        [netflixSlots, primeSlots] = await Promise.all([
          countAvailableProfiles('netflix').catch(() => 0),
          countAvailableProfiles('prime_video').catch(() => 0),
        ]);
      } catch (_) {}
      let fixa = verificarRespostaFixa(textMessage, netflixSlots, primeSlots);
      let cat = fixa.match ? fixa.categoria : null;
      // [CPA Ronda 2] quero_comprar sem plano → forçar precos (evitar gatilho de pagamento prematuro)
      if (cat === 'quero_comprar') {
        const precosOverride = getRespostaPrecosSeSemPlano(textMessage, state);
        if (precosOverride) {
          fixa = { match: true, categoria: precosOverride.categoria, resposta: precosOverride.resposta };
          cat = precosOverride.categoria;
        }
      }
      if (fixa.match) {
        if (cat === 'saudacao') {
          const jaRecebeu = _saudacaoJaEnviada(senderNum);
          if (jaRecebeu) {
            // Não enviar saudação de novo — deixar fluxo/IA tratar
          } else {
            _marcarSaudacao(senderNum, 24 * 60 * 60 * 1000);
            // [CPA] Saudação inteligente: formal + renovação só quando diasRestantes <= 7 ou expirado
            const nomeSaud = (dadosCliente && dadosCliente.nome) ? dadosCliente.nome.trim() : (state.clientName || pushName || '');
            const trat = tratamentoFormal(nomeSaud);
            if (dadosCliente && dadosCliente.ehAntigo && vendasCliente.length > 0) {
              const vendaActiva = vendasCliente.find(v => v.status === 'ativo' && v.diasRestantes != null && v.diasRestantes > 0);
              const vendaExpirada = vendasCliente.find(v => v.status === 'ativo' && v.diasRestantes != null && v.diasRestantes <= 0);
              if (vendaActiva && vendaActiva.diasRestantes > 7) {
                await sendWhatsAppMessage(senderNum,
                  `Olá, ${trat}! 😊 Bom vê-lo(a) de volta.\nO seu plano ${vendaActiva.plataforma} está activo por mais ${vendaActiva.diasRestantes} dias.\nPosso ajudar em alguma coisa?`);
                return res.status(200).send('OK');
              }
              if (vendaActiva && vendaActiva.diasRestantes <= 7 && vendaActiva.diasRestantes > 0) {
                await sendWhatsAppMessage(senderNum,
                  `Olá, ${trat}! 😊\nO seu plano ${vendaActiva.plataforma} expira em ${vendaActiva.diasRestantes} dias.\nGostaria de renovar para não perder o acesso?`);
                return res.status(200).send('OK');
              }
              if (vendaExpirada) {
                const dias = Math.abs(vendaExpirada.diasRestantes || 0);
                await sendWhatsAppMessage(senderNum,
                  `Olá, ${trat}! 😊\nVi que o seu plano ${vendaExpirada.plataforma} expirou há ${dias} dias.\nGostaria de renovar?`);
                return res.status(200).send('OK');
              }
            }
            if (dadosCliente && dadosCliente.ehAntigo && vendasCliente.length === 0) {
              await sendWhatsAppMessage(senderNum,
                `Olá, ${trat}! Bom vê-lo(a) de volta. 😊\nGostaria de ver os nossos planos?`);
              return res.status(200).send('OK');
            }
            await sendWhatsAppMessage(senderNum, fixa.resposta);
            return res.status(200).send('OK');
          }
        } else {
          // [CPA] Verificação de stock antes de confirmar compra (quando já tem plano escolhido)
          if (cat === 'quero_comprar') {
            const plat = state.plataforma || (state.cart && state.cart[0] && state.cart[0].plataforma);
            const planKey = state.plano ? state.plano.toLowerCase().replace(/\s+/g, '_') : (state.cart && state.cart[0] && state.cart[0].plan && state.cart[0].plan.toLowerCase().replace(/\s+/g, '_'));
            const tipoConta = (planKey && PLAN_PROFILE_TYPE[planKey]) ? PLAN_PROFILE_TYPE[planKey] : 'shared_profile';
            if (plat) {
              const platNorm = plat.toLowerCase().includes('netflix') ? 'Netflix' : 'Prime Video';
              try {
                const stock = await clienteLookup.verificarStock(platNorm, tipoConta);
                if (!stock.disponivel) {
                  const tipoLabel = tipoConta === 'full_account' ? 'Individual' : 'Partilhado/Família';
                  // [CPA P5] Cross-sell: Netflix sem stock → sugerir Prime Video se disponível
                  if (platNorm === 'Netflix') {
                    const primeDisponivel = await hasAnyStock('Prime Video');
                    if (primeDisponivel) {
                      await sendWhatsAppMessage(senderNum, RESPOSTA_SEM_STOCK_NETFLIX_CROSSSELL);
                      state.aguardandoCrossSellPrime = true;
                      if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `⚠️ Stock Netflix esgotado — cross-sell Prime enviado\nCliente: ${senderNum}`);
                      return res.status(200).send('OK');
                    }
                  }
                  await sendWhatsAppMessage(senderNum,
                    `De momento não temos contas ${platNorm} ${tipoLabel} disponíveis.\nPosso avisar quando tiver? Ou prefere ver outro plano?`);
                  if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `⚠️ Stock esgotado: ${platNorm} ${tipoLabel}\nCliente: ${senderNum}`);
                  return res.status(200).send('OK');
                }
              } catch (e) {
                console.error('[webhook] verificarStock quero_comprar:', e.message);
              }
            }
            if (MAIN_BOSS) {
              await sendWhatsAppMessage(MAIN_BOSS, `🛒 *QUERO COMPRAR*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage.substring(0, 80)}"`);
            }
          }
          if (cat === 'problema_conta' && MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `🔧 *PROBLEMA CONTA*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage.substring(0, 80)}"`);
          }
          if (cat === 'falar_humano') {
            if (MAIN_BOSS) {
              await sendWhatsAppMessage(MAIN_BOSS, formatarNotificacaoSuporteStreamzone(
                state.clientName || pushName, senderNum, 'Quer falar com responsável', textMessage, false
              ) + `\n\nBot pausado. Use *#retomar ${senderNum}* quando terminar.`);
            }
            _pausar(senderNum);
          }
          // [CPA] Escalação automática por categoria (codigo_verificacao, senha_errada, paguei_sem_resposta, reembolso 2x)
          if (CATEGORIAS_ESCALAR_URGENTE.includes(cat) && MAIN_BOSS) {
            const problemaLabel = problemaLabelSuporte(cat);
            await sendWhatsAppMessage(MAIN_BOSS, formatarNotificacaoSuporteStreamzone(
              state.clientName || pushName, senderNum, problemaLabel, textMessage, true
            ));
            if (CATEGORIAS_PAUSAR_BOT.includes(cat)) {
              _pausar(senderNum);
            }
          }
          if (cat === 'reembolso') {
            const count = _incrReembolso(senderNum, 60 * 60 * 1000);
            if (count >= 2 && MAIN_BOSS) {
              await sendWhatsAppMessage(MAIN_BOSS, formatarNotificacaoSuporteStreamzone(
                state.clientName || pushName, senderNum, 'Pedido de reembolso (insistência)', textMessage, false
              ));
            }
          }
          if (cat === 'reserva' && MAIN_BOSS) {
            const nomeReserva = state.clientName || pushName || senderNum;
            const contextoReserva = (state.plataforma && state.plano) ? `${state.plataforma} ${state.plano}` : 'plano a indicar';
            await sendWhatsAppMessage(MAIN_BOSS, `📋 RESERVA — ${nomeReserva} (${senderNum}) pediu para reservar ${contextoReserva}.\nPrazo: 24h. Aguarda pagamento.`);
          }
          if (CATEGORIAS_ESCALAR_NORMAL.includes(cat) && cat !== 'falar_humano' && cat !== 'reembolso' && cat !== 'reserva') {
            // falar_humano, reembolso e reserva já tratados acima
          }
          // [CPA Ronda 2] Memória de plataforma para perguntas de disponibilidade
          if (cat === 'precos_netflix') state.ultimaPlataforma = 'netflix';
          if (cat === 'precos_prime') state.ultimaPlataforma = 'prime';
          // Persistir última plataforma quando aplicável
          if (cat === 'precos_netflix' || cat === 'precos_prime') {
            await adicionarMensagem(senderNum, { role: 'user', parts: [{ text: textMessage }] }, state.ultimaPlataforma).catch(() => {});
          }
          let msgEnviar = fixa.resposta;
          if (cat === 'quero_comprar' && state.plataforma && state.plano) {
            const planoLabel = (state.plano || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            msgEnviar = `Excelente escolha do plano ${planoLabel} de ${state.plataforma}! 🎉\nPara finalizar:\n1. Faça a transferência\n2. Envie o comprovativo aqui\nQualquer dúvida, estou aqui.`;
          }
          await sendWhatsAppMessage(senderNum, msgEnviar);
          return res.status(200).send('OK');
        }
      }
    }

    if (textMessage && SALE_STEPS_FOR_EXIT_INTENT.includes(state.step) && isExitIntent(textMessage)) {
      if (!state.exitIntentAt) {
        state.exitIntentAt = Date.now();
        state.exitIntentFollowUpSent = false;
        if (state.objeccoes && !state.objeccoes.includes('vou_pensar')) state.objeccoes.push('vou_pensar');
        if (!state.objeccoes) state.objeccoes = ['vou_pensar'];
        await sendWhatsAppMessage(senderNum, 'Claro! Só aviso que os slots esgotam rápido — temos poucos perfis disponíveis agora. Queres que te reserve um por 24h? 😊');
      }
      return res.status(200).send('OK');
    }
    if (textMessage && state.exitIntentAt) {
      state.exitIntentAt = null;
      state.exitIntentFollowUpSent = false;
    }

    if (textMessage && handleChangeMind(senderNum, state, textMessage)) {
      const { msg, step } = await buildServiceMenuMsg(state, state.clientName);
      state.step = step;
      await sendWhatsAppMessage(senderNum, msg);
      return res.status(200).send('OK');
    }

    if (textMessage && state.step !== 'esperando_supervisor') {
      const normalizedMsg = textMessage.trim().toLowerCase();
      if (state.repeatTracker && normalizedMsg === state.repeatTracker.lastMsg) {
        state.repeatTracker.count++;
        if (state.repeatTracker.count >= 2) {
          pausedClients[senderNum] = true;
          await sendWhatsAppMessage(senderNum, `Parece que estou com dificuldades em entender o seu pedido. Vou chamar a nossa equipa para ajudá-lo(a)! 🛠️\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`);
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `🔁 *LOOP / PEDIDO NÃO PERCEBIDO*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage}" (repetido ${state.repeatTracker.count}x)\n📍 Step: ${state.step}\n\nBot pausado. Use *retomar ${senderNum}* quando resolver.`);
          }
          return res.status(200).send('OK');
        }
      } else {
        state.repeatTracker = { lastMsg: normalizedMsg, count: 1 };
      }
    }

    const OUT_OF_CONTEXT_STEPS = ['escolha_servico', 'escolha_plano', 'escolha_quantidade', 'confirmacao_renovacao'];
    const OUT_OF_CONTEXT_PATTERN = /^(boa (tarde|noite|manha)|ol[aá]|bom dia|como est[aá]s|tudo bem|ok|certo|entendido|sim|n[aã]o|obrigad[oa])$/i;
    if (textMessage && OUT_OF_CONTEXT_STEPS.includes(state.step) && textMessage.length > 40 && !OUT_OF_CONTEXT_PATTERN.test(textMessage.trim())) {
      const isKnownKeyword = ['netflix', 'prime', 'individual', 'partilha', 'familia', 'sim', 'nao', 'outro', 'cancelar', 'renovar']
        .some(kw => removeAccents(textMessage.toLowerCase()).includes(kw));
      if (!isKnownKeyword) {
        pausedClients[senderNum] = true;
        await sendWhatsAppMessage(senderNum, `Não consegui perceber o teu pedido. A nossa equipa irá ajudar-te em breve! 🙏\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`);
        if (MAIN_BOSS) {
          await sendWhatsAppMessage(MAIN_BOSS, `❓ *PEDIDO DESCONHECIDO / FORA DE CONTEXTO*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n📍 Step: ${state.step}\n💬 "${textMessage.substring(0, 200)}"\n\nBot pausado. Use *retomar ${senderNum}* quando resolver.`);
        }
        return res.status(200).send('OK');
      }
    }

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
        await sendWhatsAppMessage(senderNum, `📱 *Problema de Localização Netflix!*\n\nA Netflix está a verificar se o teu dispositivo faz parte da residência. Sigue estes passos simples:\n\n1️⃣ Clica em *"Ver temporariamente"* no ecrã\n2️⃣ Vai aparecer um código numérico\n3️⃣ Insere o código na app quando pedido\n4️⃣ Acesso restaurado! ✅\n\nEste processo é normal quando acedes de um novo local. Se o problema persistir, avisa-me! 😊\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`);
        if (MAIN_BOSS) {
          await sendWhatsAppMessage(MAIN_BOSS, `📱 *SUPORTE — ERRO DE RESIDÊNCIA*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage.substring(0, 100)}"\n\n✅ Cliente orientado com o passo a passo.\nSe não resolver, use *assumir ${senderNum}*.`);
        }
        return res.status(200).send('OK');
      }
    }

    if (isImage) {
      const result = await imagensHandler.handleImagem({ sendWhatsAppMessage, MAIN_BOSS, branding }, senderNum, state, true);
      if (result.handled) return res.status(200).send('OK');
    }

    if (state.step === 'esperando_supervisor') {
      await sendWhatsAppMessage(senderNum, '⏳ Obrigado! O supervisor está a validar o teu pagamento. Assim que for aprovado, os teus acessos aparecerão aqui. 😊');
      return res.status(200).send('OK');
    }

    if (state.step === 'aguardando_reposicao') {
      const recovery = state.pendingRecovery;
      const pedidoDesc = recovery ? `${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.plan} de ${recovery.service}` : 'o teu pedido';
      await sendWhatsAppMessage(senderNum, `⏳ Estamos a tratar da disponibilidade para ${pedidoDesc}. Vais receber uma resposta em breve!`);
      return res.status(200).send('OK');
    }

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
        await enviarFechoConsolidado(senderNum, state);
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
        if (/\b(cancelar|cancela|sair|desistir)\b/i.test(normalizedText)) {
          logLostSale(senderNum, state.clientName, state.interestStack || [], state.step, 'Cliente cancelou');
          const nome = state.clientName;
          clientStates[senderNum] = initClientState({ clientName: nome });
          const { msg: cancelCompMsg, step: cancelCompStep } = await buildServiceMenuMsg(clientStates[senderNum], nome);
          clientStates[senderNum].step = cancelCompStep;
          await sendWhatsAppMessage(senderNum, `Pedido cancelado. ${cancelCompMsg}`);
          return res.status(200).send('OK');
        }
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
            let msg = services.length > 1 ? `Sem problema! Vamos configurar os dois serviços.\n\nVamos começar com o ${CATALOGO[services[0]].nome}:\n\n` : 'Sem problema! ';
            msg += `${formatPriceTable(services[0])}\n\nQual plano deseja? (${planChoicesText(services[0])})`;
            await sendWhatsAppMessage(senderNum, msg);
          } else {
            const { msg, step } = await buildServiceMenuMsg(newState, nome);
            newState.step = step;
            await sendWhatsAppMessage(senderNum, msg);
          }
          return res.status(200).send('OK');
        }
        const mentionedInComprov = detectServices(textMessage || '');
        const currentSvcKey = state.cart[0]?.serviceKey || state.serviceKey;
        const otherSvcInComprov = mentionedInComprov.find(s => s !== currentSvcKey);
        if (otherSvcInComprov) {
          const currentPlatLabel = state.cart[0]?.plataforma || state.plataforma || '';
          const otherPlatLabel = CATALOGO[otherSvcInComprov].nome;
          const hasOtherStock = await hasAnyStock(otherPlatLabel);
          if (!hasOtherStock) {
            await sendWhatsAppMessage(senderNum, `De momento não temos *${otherPlatLabel}* disponível. 😔\n\nO teu pedido actual é de *${currentPlatLabel}* — assim que enviares o comprovativo, os acessos são entregues imediatamente! 😊`);
          } else {
            await sendWhatsAppMessage(senderNum, `Temos *${otherPlatLabel}* disponível! 🎉\n\nNeste momento o teu pedido é de *${currentPlatLabel}*. Podes:\n\n• Completar o pagamento actual e depois fazer um novo pedido de ${otherPlatLabel}\n• Ou escreve *cancelar* se preferires trocar de serviço agora`);
          }
          return res.status(200).send('OK');
        }
        const PAYMENT_REQUEST_KEYWORDS = [
          'dados', 'iban', 'pagamento', 'pagar', 'multicaixa', 'transferencia', 'transferência',
          'como pago', 'como pagar', 'reenviar', 'envia de novo', 'manda de novo', 'manda outra vez',
          'não recebi', 'nao recebi', 'conta', 'número de conta', 'numero de conta', 'referencia', 'referência',
        ];
        const normalizedLower = removeAccents(textMessage.toLowerCase());
        const wantsPaymentData = PAYMENT_REQUEST_KEYWORDS.some(kw => normalizedLower.includes(removeAccents(kw)));
        if (wantsPaymentData) {
          await enviarFechoConsolidado(senderNum, state);
          return res.status(200).send('OK');
        }
        try {
          const cartInfo = state.cart.map(i => {
            const qty = i.quantity || 1;
            const qtyLabel = qty > 1 ? `${qty}x ` : '';
            return `${qtyLabel}${i.plataforma} ${i.plan} (${(i.totalPrice || i.price)} Kz, ${i.totalSlots || i.slotsNeeded} perfis)`;
          }).join(', ');
          const contextPrompt = `${SYSTEM_PROMPT_COMPROVATIVO}\n\nPEDIDO ACTUAL DO CLIENTE (usa SEMPRE estes dados — NÃO inventes outros serviços): ${cartInfo}. Total: ${state.totalValor} Kz.\n\nREGRA CRÍTICA 1: NUNCA menciones um serviço diferente do pedido actual. Se o pedido é Prime Video, fala APENAS de Prime Video. Se for Netflix, fala APENAS de Netflix.\nREGRA CRÍTICA 2: NUNCA digas "consulte a conversa anterior" nem "os dados já foram partilhados".\nREGRA CRÍTICA 3: Se o cliente pedir os dados de pagamento, responde apenas: "Claro! Vou reenviar os dados agora mesmo 😊" — o sistema enviará automaticamente.\nREGRA CRÍTICA 4: Se o cliente perguntar "já tem disponível?" ou similar, responde afirmativamente para o serviço do pedido acima.`;
          const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: { parts: [{ text: contextPrompt }] },
            generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
          });
          const chat = model.startChat({ history: [...FEW_SHOT_EXAMPLES, ...(chatHistory || [])] });
          const resAI = await chat.sendMessage(textMessage);
          let aiText = resAI.response.text();
          const validacaoComp = validarRespostaZara(aiText);
          if (!validacaoComp.valido) {
            aiText = validacaoComp.substituir || 'Vou confirmar com a equipa. Dá-me um momento!';
            if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `⚠️ Resposta IA comprovativo bloqueada: ${validacaoComp.motivo}\nCliente: ${senderNum}`);
          }
          chatHistory = chatHistory || [];
          chatHistory.push({ role: 'user', parts: [{ text: textMessage }] });
          chatHistory.push({ role: 'model', parts: [{ text: aiText }] });
          await adicionarMensagem(senderNum, { role: 'user', parts: [{ text: textMessage }] }, state.ultimaPlataforma).catch(() => {});
          await adicionarMensagem(senderNum, { role: 'model', parts: [{ text: aiText }] }, state.ultimaPlataforma).catch(() => {});
          await sendWhatsAppMessage(senderNum, aiText);
        } catch (e) {
          console.error('Erro AI comprovativo:', e.message);
          await enviarFechoConsolidado(senderNum, state);
        }
        return res.status(200).send('OK');
      }
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
        await sendWhatsAppMessage(senderNum, '📄 Comprovativo recebido! Obrigado! O supervisor está a validar. Assim que for aprovado, os teus acessos aparecerão aqui. 😊');
        return res.status(200).send('OK');
      }
      return res.status(200).send('OK');
    }

    // Anti-loop: saudação simples durante fluxo activo → não reinicia
    const SAUDACOES = [/^oi$/i, /^olá$/i, /^ola$/i, /^hello$/i, /^bom dia$/i, /^boa tarde$/i, /^boa noite$/i];
    if (SAUDACOES.some(p => p.test((textMessage || '').trim())) && state.step !== 'inicio') {
      await sendWhatsAppMessage(senderNum, `Estou aqui! Em que posso ajudá-lo(a)? 😊`);
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
        const tratInicio = tratamentoFormal(nome);
        const saudacao = introOk
          ? `Olá, ${tratInicio}! 😊 Sou *${BOT_NAME}*, Assistente da ${branding.nome}. Bem-vindo(a) de volta! 🎉`
          : `Olá, ${tratInicio}! 😊`;
        console.log(`📤 DEBUG: A enviar saudação de renovação rápida para ${senderNum}`);
        await sendWhatsAppMessage(senderNum,
          `${saudacao}\n\nVi que é nosso cliente de *${existing.plataforma}* — ${lastPlanLabel}.\n\nGostaria de renovar o mesmo plano por *${lastPlanPrice.toLocaleString('pt')} Kz*?\n\n✅ *Sim* — renovar ${lastPlanLabel}\n🔄 *Outro* — escolher plano diferente`
        );
        return res.status(200).send('OK');
      }
      // [CPA] Cliente antigo → menu. Novo → usar pushName (NUNCA pedir nome), ir directo ao menu.
      state.clientName = dadosCliente && dadosCliente.nome ? dadosCliente.nome.trim() : extrairNome(pushName);
      state.step = 'escolha_servico';
      console.log(`📤 DEBUG: Inicio para ${senderNum} — nome: ${state.clientName}`);
      if (dadosCliente && dadosCliente.ehAntigo && vendasCliente.length > 0) {
        const { msg, step } = await buildServiceMenuMsg(state, state.clientName);
        state.step = step;
        await sendWhatsAppMessage(senderNum, msg);
      } else if (shouldSendIntro(senderNum)) {
        markIntroSent(senderNum);
        const { gerarTabelaPrecos } = require('../funil-zara');
        const msg = await gerarTabelaPrecos();
        await sendWhatsAppMessage(senderNum, `Olá, Caríssimo(a)! 👋 Sou *${BOT_NAME}*, Assistente da ${branding.nome}.\n\n${msg}`);
      } else {
        await sendWhatsAppMessage(senderNum, `Olá, Caríssimo(a)! 😊 Como posso ajudar?`);
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: confirmacao_renovacao ----
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
        await enviarFechoConsolidado(senderNum, state);
      } else {
        state.step = 'escolha_plano';
        await sendWhatsAppMessage(senderNum, `Sem problema! Aqui estão os planos disponíveis:\n\n${formatPriceTable(state.serviceKey)}\n\nQual plano deseja? (${planChoicesText(state.serviceKey)})`);
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: captura_nome (legado — novos fluxos usam extrairNome no inicio; aqui nunca pedir nome) ----
    if (state.step === 'captura_nome') {
      state.clientName = state.clientName || extrairNome(pushName);
      const name = state.clientName;
      try {
        const migrated = await findClientByName(name);
        if (migrated) {
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
            `Prazer${name ? ', ' + name : ''}! 😊 Vi que já és nosso cliente de *${migrated.plataforma}* — ${lastPlanLabel}.\n\nQuer renovar o mesmo plano por *${lastPlanPrice.toLocaleString('pt')} Kz*?\n\n✅ *Sim* — renovar ${lastPlanLabel}\n🔄 *Outro* — escolher plano diferente`
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
        state.clientType = detectClientType(textMessage);
        if (state.clientType === 'D') {
          await sendWhatsAppMessage(senderNum, 'Para uso empresarial temos condições especiais — posso passá-lo para o nosso gestor de conta.');
          pausedClients[senderNum] = true;
          if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `📋 Interesse empresarial: ${senderNum} (${state.clientName || 'sem nome'}). Bot pausado — falar com gestor.`);
          return res.status(200).send('OK');
        }
        const available = [];
        const outOfStock = [];
        for (const svc of services) {
          const stock = await hasAnyStock(CATALOGO[svc].nome);
          if (stock) available.push(svc);
          else outOfStock.push(svc);
        }
        for (const svc of outOfStock) {
          // [CPA P5] Cross-sell: Netflix sem stock → sugerir Prime Video se disponível
          if (svc === 'netflix') {
            const primeDisponivel = await hasAnyStock('Prime Video');
            if (primeDisponivel) {
              await sendWhatsAppMessage(senderNum, RESPOSTA_SEM_STOCK_NETFLIX_CROSSSELL);
              state.aguardandoCrossSellPrime = true;
              if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *STOCK ESGOTADO* Netflix — cross-sell Prime enviado\nCliente: ${senderNum} (${state.clientName || 'sem nome'})`);
              return res.status(200).send('OK');
            }
          }
          await sendWhatsAppMessage(senderNum, `😔 De momento não temos *${CATALOGO[svc].nome}* disponível. Vamos notificá-lo assim que houver stock!`);
          if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *STOCK ESGOTADO* de ${CATALOGO[svc].nome}!\nCliente: ${senderNum} (${state.clientName || 'sem nome'})`);
          logLostSale(senderNum, state.clientName, [svc], 'escolha_servico', `Stock esgotado: ${CATALOGO[svc].nome}`);
        }
        if (available.length === 0) return res.status(200).send('OK');
        state.interestStack = available;
        state.currentItemIndex = 0;
        state.serviceKey = available[0];
        state.plataforma = CATALOGO[available[0]].nome;
        state.ultimaPlataforma = available[0] === 'netflix' ? 'netflix' : 'prime';
        state.step = 'escolha_plano';
        let msg = '';
        if (available.length > 1) msg = `Ótimo! Vamos configurar os dois serviços.\n\nVamos começar com o ${CATALOGO[available[0]].nome}:\n\n`;
        if (state.clientType === 'C') {
          msg += `Que presente! Qual é o nome da pessoa? (podes dizer depois)\n\n${formatPriceTable(available[0])}\n\nQual plano deseja? (${planChoicesText(available[0])})`;
        } else if (state.clientType === 'B') {
          msg += `Para família recomendo o plano Família com 3 perfis — ideal para partilhar em casa.\n\n${formatPriceTable(available[0])}\n\nQual plano deseja? (${planChoicesText(available[0])})`;
        } else {
          msg += `Vais usar sozinho ou partilhar com alguém? Para um perfil só teu tens o Individual.\n\n${formatPriceTable(available[0])}\n\nQual plano deseja? (${planChoicesText(available[0])})`;
        }
        await sendWhatsAppMessage(senderNum, msg);
        return res.status(200).send('OK');
      }
      const [netflixSlots, primeSlots] = await Promise.all([
        countAvailableProfiles('netflix').catch(() => 0),
        countAvailableProfiles('prime_video').catch(() => 0),
      ]);
      const stockInfoObj = { netflix: netflixSlots, prime: primeSlots };

      // Interceptar objecções e problemas conhecidos antes do Gemini
      const interceptado = await interceptarMensagem(textMessage, state, stockInfoObj, senderNum);
      if (interceptado) {
        if (interceptado.escalar) {
          state.paused = true;
          await sendWhatsAppMessage(senderNum, `Vou ligar-te com um colega agora. Um momento! 😊`);
          if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, formatarNotificacaoSupervisor(senderNum, state.contextoCliente, `⚠️ Escalar: objecção repetida "${interceptado.tipo}"`));
          return res.status(200).send('OK');
        }
        if (interceptado.pausar) {
          state.paused = true;
          if (MAIN_BOSS && interceptado.msgSupervisor) await sendWhatsAppMessage(MAIN_BOSS, interceptado.msgSupervisor);
        }
        if (interceptado.reenviarCredenciais) {
          await sendWhatsAppMessage(senderNum, interceptado.resposta);
          await reenviarCredenciais(senderNum, state);
        } else {
          await sendWhatsAppMessage(senderNum, interceptado.resposta);
        }
        return res.status(200).send('OK');
      }

      const objKey = detectObjectionKey(textMessage);
      if (objKey && state.objeccoes && !state.objeccoes.includes(objKey)) state.objeccoes.push(objKey);
      const objeccoesLine = (state.objeccoes && state.objeccoes.length > 0) ? `\nObjecções já levantadas por este cliente (não repetir a mesma resposta, varia ou aprofunda): ${state.objeccoes.join(', ')}.` : '';
      const stockInfoStr = `Netflix: ${netflixSlots} perfis disponíveis | Prime Video: ${primeSlots} perfis disponíveis`;
      const ultimaPlatStr = state.ultimaPlataforma === 'netflix' ? 'Netflix' : state.ultimaPlataforma === 'prime' ? 'Prime Video' : 'não definida';
      const contextoClienteLine = (state.contextoClienteStr) ? `\n\nCONTEXTO CLIENTE (usa apenas esta informação, NUNCA inventes):\n${state.contextoClienteStr}` : '\n\nCONTEXTO CLIENTE: CLIENTE NOVO.';
      const contextoPlataforma = `\nÚltima plataforma na conversa: ${ultimaPlatStr}. Se o cliente perguntar sobre disponibilidade/stock sem especificar, responde sobre essa. Se não definida, pergunta: "Gostaria de verificar a disponibilidade para Netflix ou Prime Video?"`;
      const promptFinal = SYSTEM_PROMPT.replace('[STOCK_PLACEHOLDER]', stockInfoStr) + objeccoesLine + contextoClienteLine + contextoPlataforma;
      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: { parts: [{ text: promptFinal }] },
          generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
        });
        const chat = model.startChat({ history: [...FEW_SHOT_EXAMPLES, ...(chatHistory || [])] });
        const resAI = await chat.sendMessage(textMessage || 'Olá');
        let aiText = validarResposta(resAI.response.text());
        const validacao = validarRespostaZara(aiText);
        if (!validacao.valido) {
          aiText = validacao.substituir || 'Vou confirmar com a equipa. Dá-me um momento!';
          if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `⚠️ Resposta IA bloqueada (anti-alucinação): ${validacao.motivo}\nCliente: ${senderNum}\nResposta original truncada.`);
        }
        chatHistory = chatHistory || [];
        chatHistory.push({ role: 'user', parts: [{ text: textMessage || 'Olá' }] });
        chatHistory.push({ role: 'model', parts: [{ text: aiText }] });
        await adicionarMensagem(senderNum, { role: 'user', parts: [{ text: textMessage || 'Olá' }] }, state.ultimaPlataforma).catch(() => {});
        await adicionarMensagem(senderNum, { role: 'model', parts: [{ text: aiText }] }, state.ultimaPlataforma).catch(() => {});
        if (state.score) state.score.mensagens_enviadas = (state.score.mensagens_enviadas || 0) + 1;
        await sendWhatsAppMessage(senderNum, aiText);
      } catch (e) {
        console.error('Erro AI:', e.message);
        await sendWhatsAppMessage(senderNum, `${tratamentoFormal(state.clientName)}, temos Netflix e Prime Video. Qual lhe interessa?`);
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
            if (stockProfiles && MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `ℹ️ *FALLBACK*: ${senderNum} pediu ${quantity > 1 ? quantity + 'x ' : ''}${state.plataforma} ${chosen.plan} (${profileType}) mas usou ${altType}.`);
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
              const last10 = (chatHistory || []).slice(-10);
              const contextLines = last10.length > 0 ? last10.map(h => {
                const role = h.role === 'user' ? '👤' : '🤖';
                const text = (h.parts[0]?.text || '').substring(0, 100);
                return `${role} ${text}`;
              }).join('\n') : '(sem histórico)';
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
          await enviarFechoConsolidado(senderNum, state);
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
      const mentionedServices = detectServices(textMessage || '');
      const switchedService = mentionedServices.find(s => s !== state.serviceKey);
      if (switchedService) {
        const hasSwStock = await hasAnyStock(CATALOGO[switchedService].nome);
        if (!hasSwStock) {
          await sendWhatsAppMessage(senderNum, `😔 De momento não temos *${CATALOGO[switchedService].nome}* disponível.\n\nMas temos *${CATALOGO[state.serviceKey].nome}* disponível! Qual plano prefere? (Individual / Partilha / Família)\n\n${formatPriceTable(state.serviceKey)}`);
          if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *STOCK ESGOTADO* de ${CATALOGO[switchedService].nome}!\nCliente: ${senderNum} (${state.clientName || 'sem nome'}) solicitou em mid-flow.\nMantido no fluxo de ${CATALOGO[state.serviceKey].nome}.`);
        } else {
          state.serviceKey = switchedService;
          state.plataforma = CATALOGO[switchedService].nome;
          if (!state.interestStack.includes(switchedService)) {
            state.interestStack = [switchedService];
            state.currentItemIndex = 0;
          } else state.currentItemIndex = state.interestStack.indexOf(switchedService);
          await sendWhatsAppMessage(senderNum, `${formatPriceTable(switchedService)}\n\nQual plano prefere? (${planChoicesText(switchedService)})`);
        }
        return res.status(200).send('OK');
      }
      const objKeyPlan = detectObjectionKey(textMessage);
      if (objKeyPlan && state.objeccoes && !state.objeccoes.includes(objKeyPlan)) state.objeccoes.push(objKeyPlan);
      const objeccoesLinePlan = (state.objeccoes && state.objeccoes.length > 0) ? `\nObjecções já levantadas (não repetir a mesma resposta): ${state.objeccoes.join(', ')}.` : '';
      try {
        const availPlans = Object.entries(CATALOGO[state.serviceKey].planos).map(([p, price]) => `- ${p.charAt(0).toUpperCase() + p.slice(1)}: ${PLAN_SLOTS[p] || 1} perfil(s), ${price.toLocaleString('pt')} Kz`).join('\n');
        const choicesStr = planChoicesText(state.serviceKey);
        const otherSvc = state.serviceKey === 'netflix' ? 'Prime Video' : 'Netflix';
        const planContext = `Tu és o Assistente de IA da ${branding.nome}. O cliente está a escolher um plano de ${state.plataforma} APENAS.\n\nPLANOS DE ${state.plataforma.toUpperCase()} DISPONÍVEIS:\n${availPlans}\n\nREGRAS: Fala APENAS sobre ${state.plataforma}. Responde em 1-2 frases curtas. Termina com: "Qual plano prefere? (${choicesStr})"${objeccoesLinePlan}`;
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: { parts: [{ text: planContext }] }
        });
        const recentHistory = (chatHistory || []).slice(-10);
        const chat = model.startChat({ history: recentHistory });
        const resAI = await chat.sendMessage(textMessage);
        const aiReplyPlan = resAI.response.text();
        chatHistory = chatHistory || [];
        chatHistory.push({ role: 'user', parts: [{ text: textMessage }] });
        chatHistory.push({ role: 'model', parts: [{ text: aiReplyPlan }] });
        await adicionarMensagem(senderNum, { role: 'user', parts: [{ text: textMessage }] }, state.ultimaPlataforma).catch(() => {});
        await adicionarMensagem(senderNum, { role: 'model', parts: [{ text: aiReplyPlan }] }, state.ultimaPlataforma).catch(() => {});
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
        await enviarFechoConsolidado(senderNum, state);
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
    const phone = req.body?.data?.key?.senderPn || req.body?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '').replace('@lid', '');
    if (phone) {
      await sendWhatsAppMessage(phone,
        `Peço desculpa, ocorreu um problema do meu lado 😔\nVou chamar um colega para ajudá-lo(a) agora. Um momento!`
      ).catch(() => {});
      if (MAIN_BOSS) await sendWhatsAppMessage(MAIN_BOSS,
        `🆘 FALLBACK UNIVERSAL\n📞 ${phone}\nMotivo: ${error.message}\nAcção: assumir conversa urgente`
      ).catch(() => {});
      if (clientStates[phone]) clientStates[phone].paused = true;
    }
    res.status(200).send('OK');
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [phone, state] of Object.entries(clientStates)) {
    if (!state.exitIntentAt) continue;
    if (state.step === 'aguardando_comprovativo' || state.step === 'esperando_supervisor') continue;
    const elapsed = now - state.exitIntentAt;
    if (elapsed >= FIFTEEN_MIN_MS) {
      cleanupSession(phone);
      continue;
    }
    if (elapsed >= FIVE_MIN_MS && !state.exitIntentFollowUpSent) {
      state.exitIntentFollowUpSent = true;
      sendWhatsAppMessage(phone, 'Olá! Ainda estás aí? Posso ajudar com alguma dúvida antes de decidires?').catch(() => {});
    }
  }
}, 60 * 1000);

module.exports = { handleWebhook };
