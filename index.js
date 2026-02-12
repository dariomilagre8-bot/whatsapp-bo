require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  cleanNumber, todayDate,
  updateSheetCell, markProfileSold, markProfileAvailable,
  checkClientInSheet, findAvailableProfile, hasAnyStock,
  appendLostSale,
} = require('./googleSheets');

const app = express();
app.use(express.json());

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==================== CONFIGURACOES ====================
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
  prime: {
    nome: 'Prime Video',
    emoji: '📺',
    planos: { individual: 3000, partilha: 5500, familia: 8000 }
  }
};

const PLAN_SLOTS = { individual: 1, partilha: 2, familia: 3 };

const PAYMENT = {
  titular: 'Braulio Manuel',
  iban: '0040.0000.7685.3192.1018.3',
  multicaixa: '946014060'
};

const PLAN_PROFILE_TYPE = { individual: 'full_account', partilha: 'shared_profile', familia: 'shared_profile' };

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
  return [
    `${svc.emoji} *TABELA ${svc.nome.toUpperCase()}*`,
    `👤 Individual: ${svc.planos.individual.toLocaleString('pt')} Kz`,
    `👥 Partilha: ${svc.planos.partilha.toLocaleString('pt')} Kz`,
    `👨‍👩‍👧 Família: ${svc.planos.familia.toLocaleString('pt')} Kz`
  ].join('\n');
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

// Retorna array de serviceKeys detectados (suporta multi-servico)
function detectServices(text) {
  const lower = text.toLowerCase();
  const both = /\bos dois\b|\bambos\b|\btudo\b|\bas duas\b|\bos 2\b/.test(lower);

  const hasNetflix = lower.includes('netflix');
  const hasPrime = lower.includes('prime');

  if (both || (hasNetflix && hasPrime)) return ['netflix', 'prime'];
  if (hasNetflix) return ['netflix'];
  if (hasPrime) return ['prime'];
  return [];
}

function detectSupportIssue(text) {
  const lower = text.toLowerCase();
  return SUPPORT_KEYWORDS.some(kw => lower.includes(kw));
}

// ==================== PROMPTS GEMINI ====================
const SYSTEM_PROMPT = `Tu és o assistente virtual da StreamZone, uma loja de contas de streaming (Netflix e Prime Video) em Angola.

REGRAS:
- NUNCA reveles o IBAN ou dados de pagamento antes do cliente escolher um plano
- NUNCA menciones comprovativos ou PDFs antes do pagamento
- Guia a conversa para escolher Netflix ou Prime Video
- Sê caloroso, simpático e profissional
- Responde sempre em Português
- Máximo 3 frases por resposta
- Redireciona temas fora do contexto para os nossos serviços`;

const SYSTEM_PROMPT_COMPROVATIVO = `Tu és o assistente da StreamZone. O cliente já escolheu um plano e está na fase de pagamento.

CONTEXTO:
- O cliente deve enviar o comprovativo de pagamento (APENAS PDF)
- Podes responder a perguntas sobre preço, método de pagamento, como funciona
- Sê breve (2-3 frases máximo)
- Termina SEMPRE com um lembrete gentil para enviar o comprovativo
- NUNCA inventes dados de pagamento, o cliente já os recebeu`;

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

// Sweep: clientes inativos há 2+ horas
setInterval(() => {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [num, state] of Object.entries(clientStates)) {
    if (state.lastActivity && (now - state.lastActivity) > TWO_HOURS) {
      if (state.step !== 'inicio' && state.step !== 'esperando_supervisor' && !pendingVerifications[num]) {
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

// Envia 6 mensagens separadas de pagamento (facilita copy-paste)
async function sendPaymentMessages(number, state) {
  const isMulti = state.cart.length > 1;

  // MSG1: Resumo do pedido
  let summary;
  if (isMulti) {
    const lines = state.cart.map((item, i) =>
      `${i + 1}. ${item.plataforma} ${item.plan} - ${item.price.toLocaleString('pt')} Kz`
    );
    summary = `📦 *Resumo do Pedido:*\n${lines.join('\n')}\n💰 *Total: ${state.totalValor.toLocaleString('pt')} Kz*`;
  } else {
    const item = state.cart[0];
    summary = `📦 *${item.plataforma} - ${item.plan}*\n💰 *Valor: ${item.price.toLocaleString('pt')} Kz*`;
  }
  await sendWhatsAppMessage(number, summary);

  // MSG2: Header de pagamento
  await sendWhatsAppMessage(number, '🏦 *DADOS PARA PAGAMENTO:*');

  // MSG3: IBAN (apenas o número para copy-paste fácil)
  await sendWhatsAppMessage(number, PAYMENT.iban);

  // MSG4: Multicaixa Express
  await sendWhatsAppMessage(number, PAYMENT.multicaixa);

  // MSG5: Titular
  await sendWhatsAppMessage(number, `👤 *Titular:* ${PAYMENT.titular}`);

  // MSG6: Instrução para enviar comprovativo
  await sendWhatsAppMessage(number, 'Após o pagamento, envie o comprovativo de pagamento APENAS em formato PDF. 📄');
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
    const isDoc = !!messageData.message?.documentMessage;
    const isImage = !!messageData.message?.imageMessage;

    console.log(`📩 De: ${senderNum} (${pushName}) | Msg: ${textMessage}${lidId ? ` [LID: ${lidId}]` : ''}`);

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

      // --- Aprovar / Rejeitar ---
      let action = null;
      if (['sim', 's', 'ok', 'aprovado'].includes(command)) action = 'approve';
      if (['nao', 'n', 'no', 'rejeitado'].includes(command)) action = 'reject';

      if (action) {
        let targetClient = textMessage.match(/\d{9,}/) ? textMessage.match(/\d{9,}/)[0] : null;

        if (!targetClient) {
          const pendingList = Object.keys(pendingVerifications);
          if (pendingList.length === 1) targetClient = pendingList[0];
          else if (pendingList.length > 1) {
            await sendWhatsAppMessage(senderNum, `⚠️ Tenho ${pendingList.length} pedidos. Especifique o número.`);
            return res.status(200).send('OK');
          } else {
            await sendWhatsAppMessage(senderNum, '✅ Nada pendente.');
            return res.status(200).send('OK');
          }
        }

        const pedido = pendingVerifications[targetClient];
        if (!pedido) {
          await sendWhatsAppMessage(senderNum, '⚠️ Cliente não encontrado nos pendentes.');
          return res.status(200).send('OK');
        }

        if (action === 'approve') {
          await sendWhatsAppMessage(senderNum, '🔄 Aprovado! A processar...');

          const results = [];
          let allSuccess = true;

          for (const item of pedido.cart) {
            const slotsNeeded = item.slotsNeeded;
            const profileType = PLAN_PROFILE_TYPE[item.plan.toLowerCase()] || 'shared_profile';
            let profile = null;

            if (pedido.isRenewal) {
              const existing = await checkClientInSheet(targetClient);
              if (existing) {
                profile = {
                  rowIndex: existing.rowIndex,
                  plataforma: existing.plataforma,
                  email: existing.email,
                  senha: existing.senha,
                  nomePerfil: existing.nomePerfil,
                  pin: existing.pin,
                  isRenewal: true
                };
              }
            } else {
              profile = await findAvailableProfile(item.plataforma, slotsNeeded, profileType);
              if (!profile) {
                // Fallback: tentar tipo alternativo
                const altType = profileType === 'full_account' ? 'shared_profile' : 'full_account';
                profile = await findAvailableProfile(item.plataforma, slotsNeeded, altType);
                if (profile) {
                  await sendWhatsAppMessage(senderNum, `ℹ️ Fallback: ${item.plataforma} ${item.plan} usou tipo ${altType} em vez de ${profileType}.`);
                }
              }
            }

            if (profile) {
              results.push({ item, profile, success: true });
            } else {
              results.push({ item, profile: null, success: false });
              allSuccess = false;
            }
          }

          // Entregar credenciais
          if (results.some(r => r.success)) {
            await sendWhatsAppMessage(targetClient, '✅ *PAGAMENTO APROVADO!*\n\nAqui estão os seus dados:\n');

            for (const result of results) {
              if (result.success) {
                const p = result.profile;
                const entrega = `📺 *${result.item.plataforma}*\n📧 *Email:* ${p.email}\n🔑 *Senha:* ${p.senha}\n👤 *Perfil:* ${p.nomePerfil}\n🔢 *Pin:* ${p.pin}`;
                await sendWhatsAppMessage(targetClient, entrega);

                if (p.isRenewal) {
                  await updateSheetCell(p.rowIndex, 'H', todayDate());
                } else {
                  await markProfileSold(p.rowIndex, pedido.clientName || '', targetClient, result.item.slotsNeeded);
                }
              }
            }

            await sendWhatsAppMessage(targetClient, 'Obrigado por escolher a StreamZone! 🎉');
          }

          // Notificar supervisor
          if (allSuccess) {
            const totalSlots = pedido.cart.reduce((sum, item) => sum + item.slotsNeeded, 0);
            await sendWhatsAppMessage(senderNum, `✅ Conta(s) entregue(s) + planilha atualizada! (${pedido.cart.length} serviço(s), ${totalSlots} slot(s))`);
          } else {
            const failed = results.filter(r => !r.success);
            const failedNames = failed.map(r => `${r.item.plataforma} ${r.item.plan}`).join(', ');
            if (results.some(r => r.success)) {
              await sendWhatsAppMessage(targetClient, `⚠️ Alguns serviços serão enviados manualmente: ${failedNames}`);
            } else {
              await sendWhatsAppMessage(targetClient, '✅ Pagamento recebido! O supervisor enviará as contas manualmente.');
            }
            await sendWhatsAppMessage(senderNum, `⚠️ *SEM STOCK* para: ${failedNames}. Envie manualmente!`);
          }

          delete pendingVerifications[targetClient];
          delete clientStates[targetClient];
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

    // ---- DETEÇÃO DE LOOP: mensagem repetida ----
    if (textMessage && state.step !== 'esperando_supervisor') {
      const normalizedMsg = textMessage.trim().toLowerCase();
      if (state.repeatTracker && normalizedMsg === state.repeatTracker.lastMsg) {
        state.repeatTracker.count++;
        if (state.repeatTracker.count >= 2) {
          pausedClients[senderNum] = true;
          await sendWhatsAppMessage(senderNum, 'Parece que estou com dificuldades em entender. Vou chamar um suporte humano para te ajudar! 🛠️');
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `🔁 *LOOP DETETADO*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage}" (repetido ${state.repeatTracker.count + 1}x)\n📍 Step: ${state.step}\n\nBot pausado. Use *retomar ${senderNum}* quando resolver.`);
          }
          return res.status(200).send('OK');
        }
      } else {
        state.repeatTracker = { lastMsg: normalizedMsg, count: 1 };
      }
    }

    // ---- INTERCETADOR GLOBAL: Questão técnica (NLP) ----
    if (textMessage && state.step !== 'esperando_supervisor' && state.step !== 'captura_nome' && detectSupportIssue(textMessage)) {
      pausedClients[senderNum] = true;
      await sendWhatsAppMessage(senderNum, 'Entendi que é uma questão técnica. Vou chamar o suporte humano. 🛠️');
      if (MAIN_BOSS) {
        await sendWhatsAppMessage(MAIN_BOSS, `🛠️ *SUPORTE TÉCNICO*\n👤 Cliente: ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n💬 "${textMessage}"\n\nBot pausado. Use *retomar ${senderNum}* quando resolver.`);
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: esperando_supervisor ----
    if (state.step === 'esperando_supervisor') {
      await sendWhatsAppMessage(senderNum, '⏳ O seu comprovativo está a ser verificado. Por favor aguarde!');
      return res.status(200).send('OK');
    }

    // ---- STEP: aguardando_comprovativo ----
    if (state.step === 'aguardando_comprovativo') {
      // --- ANÁLISE DE TEXTO ANTES DE FICHEIROS ---
      if (textMessage) {
        const normalizedText = removeAccents(textMessage.toLowerCase());

        // 1. Cancelamento direto
        if (/\b(cancelar|cancela|sair|desistir|voltar|menu|inicio)\b/i.test(normalizedText)) {
          logLostSale(senderNum, state.clientName, state.interestStack || [], state.step, 'Cliente cancelou');
          const nome = state.clientName;
          clientStates[senderNum] = initClientState({ clientName: nome });
          clientStates[senderNum].step = 'escolha_servico';
          await sendWhatsAppMessage(senderNum, 'Pedido cancelado. Como posso ajudar?\n\n🎬 *Netflix*\n📺 *Prime Video*');
          return res.status(200).send('OK');
        }

        // 2. Mudança de ideia — palavras-chave expandidas
        const changeMindPattern = /\b(netflix|prime|outro plano|quero outro|outro|mudar|trocar|corrigir|nao|não)\b/i;
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
            msg += `${formatPriceTable(services[0])}\n\nQual plano deseja? (Individual / Partilha / Família)`;
            await sendWhatsAppMessage(senderNum, msg);
          } else {
            newState.step = 'escolha_servico';
            await sendWhatsAppMessage(senderNum, `Sem problema${nome ? ', ' + nome : ''}! Vamos recomeçar.\n\n🎬 *Netflix*\n📺 *Prime Video*\n\nQual te interessa?`);
          }
          return res.status(200).send('OK');
        }
      }

      // --- FICHEIROS: Aceitar PDF, rejeitar imagens com feedback inteligente ---
      if (isImage) {
        if (!state.paymentReminderSent) {
          state.paymentReminderSent = true;
          await sendWhatsAppMessage(senderNum, '⚠️ Não aceitamos imagens como comprovativo.\nDeseja enviar o comprovativo em PDF ou quer alterar o seu pedido?');
        } else {
          await sendWhatsAppMessage(senderNum, 'Por favor, envie o comprovativo de pagamento APENAS em formato PDF. 📄\nOu escreva *cancelar* / *mudar* para alterar o pedido.');
        }
        return res.status(200).send('OK');
      }

      if (isDoc) {
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
          const items = state.cart.map((item, i) =>
            `  ${i + 1}. ${item.plataforma} - ${item.plan} (${item.slotsNeeded} slot${item.slotsNeeded > 1 ? 's' : ''})`
          ).join('\n');
          const totalStr = state.totalValor ? state.totalValor.toLocaleString('pt') + ' Kz' : 'N/A';
          const msgSuper = `📩 *NOVO COMPROVATIVO*${renewTag} (📄 PDF)\n👤 Cliente: ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n📦 Pedido:\n${items}\n💰 Total: ${totalStr}\n\nResponda: *sim* ou *nao*`;
          await sendWhatsAppMessage(MAIN_BOSS, msgSuper);
        }
        await sendWhatsAppMessage(senderNum, '📄 Comprovativo recebido! Estamos a verificar o seu pagamento. ⏳');
        return res.status(200).send('OK');
      }

      // --- TEXTO SEM INTENÇÃO DE MUDANÇA: feedback inteligente (1x) ---
      if (textMessage) {
        const infoPatterns = /pre[çc]o|quanto|custa|como funciona|m[ée]todo|pagamento|iban|transfer[êe]ncia|multicaixa|refer[êe]ncia|dados|conta|banco/i;
        if (infoPatterns.test(textMessage)) {
          try {
            const model = genAI.getGenerativeModel({
              model: 'gemini-2.5-flash',
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT_COMPROVATIVO }] }
            });
            const chat = model.startChat({ history: [] });
            const resAI = await chat.sendMessage(textMessage);
            const aiText = resAI.response.text();
            await sendWhatsAppMessage(senderNum, aiText);
          } catch (e) {
            console.error('Erro AI comprovativo:', e.message);
            await sendWhatsAppMessage(senderNum, 'Deseja enviar o comprovativo em PDF ou quer alterar o seu pedido?');
          }
        } else if (!state.paymentReminderSent) {
          state.paymentReminderSent = true;
          await sendWhatsAppMessage(senderNum, 'Deseja enviar o comprovativo em PDF ou quer alterar o seu pedido?');
        } else {
          await sendWhatsAppMessage(senderNum, 'Envie o comprovativo em *PDF* ou escreva *cancelar* / *mudar* para alterar o pedido. 📄');
        }
      }
      return res.status(200).send('OK');
    }

    // ---- STEP: inicio ----
    if (state.step === 'inicio') {
      console.log(`🔍 DEBUG: Entrando no step INICIO para ${senderNum}`);
      const existing = await checkClientInSheet(senderNum);
      console.log(`🔍 DEBUG: checkClientInSheet resultado:`, existing ? 'ENCONTRADO' : 'NAO ENCONTRADO');
      if (existing) {
        const svcKey = existing.plataforma.toLowerCase().includes('netflix') ? 'netflix' : 'prime';
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
        await sendWhatsAppMessage(senderNum, `${saudacao}\n\nVejo que já é nosso cliente de *${existing.plataforma}*! Quer renovar?\n\n${formatPriceTable(svcKey)}\n\nQual plano deseja? (Individual / Partilha / Família)`);
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
        // Verificar stock para cada serviço
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

        // Notificar serviços esgotados
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

        // Configurar interest stack
        state.interestStack = available;
        state.currentItemIndex = 0;
        state.serviceKey = available[0];
        state.plataforma = CATALOGO[available[0]].nome;
        state.step = 'escolha_plano';

        let msg = '';
        if (available.length > 1) {
          msg = `Ótimo! Vamos configurar os dois serviços.\n\nVamos começar com o ${CATALOGO[available[0]].nome}:\n\n`;
        }
        msg += `${formatPriceTable(available[0])}\n\nQual plano deseja? (Individual / Partilha / Família)`;
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
        const slotsNeeded = PLAN_SLOTS[chosen.plan] || 1;
        const profileType = PLAN_PROFILE_TYPE[chosen.plan] || 'shared_profile';

        // Verificar stock (não para renovações)
        if (!state.isRenewal) {
          let profile = await findAvailableProfile(state.plataforma, slotsNeeded, profileType);

          if (!profile) {
            // Fallback: tentar tipo alternativo
            const altType = profileType === 'full_account' ? 'shared_profile' : 'full_account';
            profile = await findAvailableProfile(state.plataforma, slotsNeeded, altType);

            if (profile && MAIN_BOSS) {
              await sendWhatsAppMessage(MAIN_BOSS, `ℹ️ *FALLBACK*: ${senderNum} pediu ${state.plataforma} ${chosen.plan} (${profileType}) mas usou ${altType}.`);
            }
          }

          if (!profile) {
            // Ambos os tipos esgotados
            logLostSale(senderNum, state.clientName, [state.serviceKey], 'escolha_plano', `Sem stock: ${state.plataforma} ${chosen.plan}`);
            pausedClients[senderNum] = true;
            await sendWhatsAppMessage(senderNum, `😔 De momento não temos stock para *${chosen.plan.charAt(0).toUpperCase() + chosen.plan.slice(1)}* de ${state.plataforma}. O nosso suporte vai tratar do seu pedido!`);
            if (MAIN_BOSS) {
              await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *SEM STOCK*\n👤 ${senderNum} (${state.clientName || ''})\n📦 ${state.plataforma} - ${chosen.plan} (${profileType})\n\nUse *retomar ${senderNum}* quando resolver.`);
            }
            return res.status(200).send('OK');
          }
        }

        // Adicionar ao carrinho
        state.cart.push({
          serviceKey: state.serviceKey,
          plataforma: state.plataforma,
          plan: chosen.plan.charAt(0).toUpperCase() + chosen.plan.slice(1),
          price: chosen.price,
          slotsNeeded: slotsNeeded
        });
        state.totalValor += chosen.price;

        // Verificar se há mais serviços na stack
        if (state.currentItemIndex < state.interestStack.length - 1) {
          // Mais serviços para configurar
          state.currentItemIndex++;
          const nextSvc = state.interestStack[state.currentItemIndex];
          state.serviceKey = nextSvc;
          state.plataforma = CATALOGO[nextSvc].nome;
          await sendWhatsAppMessage(senderNum, `✅ ${state.cart[state.cart.length - 1].plataforma} - ${state.cart[state.cart.length - 1].plan} adicionado!\n\nAgora vamos ao ${CATALOGO[nextSvc].nome}:\n\n${formatPriceTable(nextSvc)}\n\nQual plano deseja? (Individual / Partilha / Família)`);
        } else if (state.cart.length === 1) {
          // Item único — ir direto para pagamento
          state.plano = state.cart[0].plan;
          state.valor = state.cart[0].price;
          state.step = 'aguardando_comprovativo';
          await sendWhatsAppMessage(senderNum, 'Excelente escolha! 🎉');
          await sendPaymentMessages(senderNum, state);
        } else {
          // Multi-item — mostrar resumo para confirmação
          state.step = 'resumo_pedido';
          const lines = state.cart.map((item, i) =>
            `${i + 1}. ${item.plataforma} ${item.plan} - ${item.price.toLocaleString('pt')} Kz`
          );
          await sendWhatsAppMessage(senderNum, `📋 *Resumo do Pedido:*\n\n${lines.join('\n')}\n\n💰 *Total: ${state.totalValor.toLocaleString('pt')} Kz*\n\nConfirma? (sim / não)`);
        }
        return res.status(200).send('OK');
      }

      await sendWhatsAppMessage(senderNum, 'Por favor, escolha um dos planos:\n👤 *Individual*\n👥 *Partilha*\n👨‍👩‍👧 *Família*');
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

app.listen(port, '0.0.0.0', () => console.log(`Bot v10.0 (StreamZone - IA Identity + PDF-Only + Anti-Zombie + Loop Detection) rodando na porta ${port}`));
