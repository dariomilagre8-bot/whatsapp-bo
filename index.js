require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  cleanNumber, todayDate,
  updateSheetCell, markProfileSold, markProfileAvailable,
  checkClientInSheet, findAvailableProfile, hasAnyStock,
} = require('./googleSheets');

const app = express();
app.use(express.json());

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==================== CONFIGURAÇÕES ====================
const RAW_SUPERVISORS = (process.env.SUPERVISOR_NUMBER || '').split(',').map(n => n.trim().replace(/\D/g, ''));
const REAL_PHONES = RAW_SUPERVISORS.filter(n => n.length < 15);
const ALL_SUPERVISORS = RAW_SUPERVISORS;
const MAIN_BOSS = REAL_PHONES.length > 0 ? REAL_PHONES[0] : null;

console.log('📱 Telefones Reais:', REAL_PHONES);
console.log('🖥️ Todos os IDs aceites:', ALL_SUPERVISORS);
console.log('👑 Chefe Principal:', MAIN_BOSS);

// ==================== CATÁLOGO ====================
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
const IBAN = 'AO06.0040.0000.0000.0000.0000.0';

const SUPPORT_KEYWORDS = [
  'não entra', 'nao entra', 'senha errada', 'ajuda', 'travou',
  'não funciona', 'nao funciona', 'problema', 'erro',
  'não consigo', 'nao consigo', 'não abre', 'nao abre'
];

// ==================== FUNÇÕES PURAS ====================
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
  const lower = text.toLowerCase();
  const svc = CATALOGO[serviceKey];
  if (!svc) return null;
  for (const [plan, price] of Object.entries(svc.planos)) {
    if (lower.includes(plan)) return { plan, price };
  }
  return null;
}

function detectService(text) {
  const lower = text.toLowerCase();
  if (lower.includes('netflix')) return 'netflix';
  if (lower.includes('prime')) return 'prime';
  return null;
}

function detectSupportIssue(text) {
  const lower = text.toLowerCase();
  return SUPPORT_KEYWORDS.some(kw => lower.includes(kw));
}

// ==================== PROMPT GEMINI ====================
const SYSTEM_PROMPT = `Tu és o assistente virtual da StreamZone, uma loja de contas de streaming (Netflix e Prime Video) em Angola.

REGRAS:
- NUNCA reveles o IBAN ou dados de pagamento antes do cliente escolher um plano
- NUNCA menciones comprovativos ou PDFs antes do pagamento
- Guia a conversa para escolher Netflix ou Prime Video
- Sê caloroso, simpático e profissional
- Responde sempre em Português
- Máximo 3 frases por resposta
- Redireciona temas fora do contexto para os nossos serviços`;

// ==================== ESTADOS ====================
const chatHistories = {};
const clientStates = {};
const pendingVerifications = {};
const pausedClients = {};
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

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

// ==================== SERVIDOR ====================
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (body.event !== 'messages.upsert') return res.status(200).send('OK');
    const messageData = body.data;
    if (messageData.key.fromMe) return res.status(200).send('Ignore self');

    const remoteJid = messageData.key.remoteJid;
    const senderPn = messageData.key.senderPn || '';  // Número real (ex: 244923977621@s.whatsapp.net)
    const rawJid = cleanNumber(remoteJid);
    const realPhone = senderPn ? cleanNumber(senderPn) : rawJid;
    const senderNum = realPhone;  // SEMPRE o número real do telefone
    const lidId = remoteJid.includes('@lid') ? rawJid : null;  // Guardar o LID para envio se necessário

    const pushName = messageData.pushName || '';
    const textMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
    const isDoc = !!messageData.message?.documentMessage;

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

          const slotsNeeded = PLAN_SLOTS[pedido.plano.toLowerCase()] || 1;
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
            const found = await findAvailableProfile(pedido.plataforma, slotsNeeded);
            if (found) {
              profile = { ...found, isRenewal: false };
            }
          }

          if (profile) {
            const entrega = `✅ *PAGAMENTO APROVADO!*\n\nAqui estão os seus dados:\n\n📺 *${profile.plataforma}*\n📧 *Email:* ${profile.email}\n🔑 *Senha:* ${profile.senha}\n👤 *Perfil:* ${profile.nomePerfil}\n🔢 *Pin:* ${profile.pin}\n\nObrigado por escolher a StreamZone! 🎉`;
            await sendWhatsAppMessage(targetClient, entrega);

            if (profile.isRenewal) {
              await updateSheetCell(profile.rowIndex, 'I', todayDate());
            } else {
              await markProfileSold(profile.rowIndex, pedido.clientName || '', targetClient, slotsNeeded);
            }

            delete pendingVerifications[targetClient];
            delete clientStates[targetClient];
            delete chatHistories[targetClient];
            await sendWhatsAppMessage(senderNum, `✅ Conta entregue + planilha atualizada! (${slotsNeeded} slot${slotsNeeded > 1 ? 's' : ''})`);
          } else {
            await sendWhatsAppMessage(targetClient, '✅ Pagamento recebido! O supervisor enviará a conta manualmente.');
            await sendWhatsAppMessage(senderNum, `⚠️ *SEM STOCK* para ${pedido.plataforma} (${pedido.plano}, ${slotsNeeded} slots). Envie manualmente!`);
            delete pendingVerifications[targetClient];
            delete clientStates[targetClient];
          }
        } else {
          await sendWhatsAppMessage(targetClient, '❌ Comprovativo inválido. Por favor, envie novamente o PDF correto.');
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

    if (!clientStates[senderNum]) clientStates[senderNum] = { step: 'inicio' };
    if (!chatHistories[senderNum]) chatHistories[senderNum] = [];

    const state = clientStates[senderNum];
    console.log(`🔍 DEBUG: step="${state.step}" para ${senderNum}`);

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
      if (isDoc && messageData.message.documentMessage.mimetype === 'application/pdf') {
        const slotsNeeded = PLAN_SLOTS[state.plano.toLowerCase()] || 1;
        pendingVerifications[senderNum] = {
          plataforma: state.plataforma,
          plano: state.plano,
          valor: state.valor,
          clientName: state.clientName || '',
          isRenewal: state.isRenewal || false,
          timestamp: Date.now()
        };
        state.step = 'esperando_supervisor';

        if (MAIN_BOSS) {
          const renewTag = state.isRenewal ? ' (RENOVAÇÃO)' : '';
          const msgSuper = `📩 *NOVO COMPROVATIVO*${renewTag}\n👤 Cliente: ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n📦 ${state.plataforma} - ${state.plano} (${slotsNeeded} slot${slotsNeeded > 1 ? 's' : ''})\n💰 ${state.valor ? state.valor.toLocaleString('pt') + ' Kz' : 'N/A'}\n\nResponda: *sim* ou *nao*`;
          await sendWhatsAppMessage(MAIN_BOSS, msgSuper);
        }
        await sendWhatsAppMessage(senderNum, '📄 Comprovativo recebido! Estamos a verificar o seu pagamento. ⏳');
      } else if (textMessage || messageData.message?.imageMessage) {
        await sendWhatsAppMessage(senderNum, '⚠️ Por favor, envie o comprovativo em formato *PDF*.');
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
        state.step = 'escolha_plano';

        const saudacao = nome ? `Olá ${nome}! 👋` : 'Olá! 👋';
        console.log(`📤 DEBUG: A enviar saudação de renovação para ${senderNum}`);
        await sendWhatsAppMessage(senderNum, `${saudacao}\n\nVejo que já é nosso cliente de *${existing.plataforma}*! Quer renovar?\n\n${formatPriceTable(svcKey)}\n\nQual plano deseja? (Individual / Partilha / Família)`);
        return res.status(200).send('OK');
      }

      state.step = 'captura_nome';
      console.log(`📤 DEBUG: A enviar saudação inicial para ${senderNum}`);
      await sendWhatsAppMessage(senderNum, 'Olá! Bem-vindo à StreamZone. 👋\nCom quem tenho o prazer de falar?');
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
      const svc = detectService(textMessage);
      if (svc) {
        state.serviceKey = svc;
        state.plataforma = CATALOGO[svc].nome;

        const stock = await hasAnyStock(state.plataforma);
        if (!stock) {
          await sendWhatsAppMessage(senderNum, `😔 De momento não temos *${state.plataforma}* disponível. Vamos notificá-lo assim que houver stock!`);
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *STOCK ESGOTADO* de ${state.plataforma}!\nCliente: ${senderNum} (${state.clientName || 'sem nome'})`);
          }
          return res.status(200).send('OK');
        }

        state.step = 'escolha_plano';
        await sendWhatsAppMessage(senderNum, `${formatPriceTable(svc)}\n\nQual plano deseja? (Individual / Partilha / Família)`);
        return res.status(200).send('OK');
      }

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

        if (!state.isRenewal) {
          const profile = await findAvailableProfile(state.plataforma, slotsNeeded);

          if (!profile) {
            pausedClients[senderNum] = true;
            await sendWhatsAppMessage(senderNum, `😔 De momento não conseguimos processar o plano *${chosen.plan.charAt(0).toUpperCase() + chosen.plan.slice(1)}* automaticamente. O nosso suporte vai tratar do seu pedido!`);
            if (MAIN_BOSS) {
              await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *SLOTS INSUFICIENTES*\n👤 Cliente: ${senderNum} (${state.clientName || 'sem nome'})\n📦 ${state.plataforma} - ${chosen.plan} (precisa ${slotsNeeded} slot${slotsNeeded > 1 ? 's' : ''})\n\nCliente quer plano maior que o stock disponível neste email. Assuma a gestão.\nUse *retomar ${senderNum}* quando resolver.`);
            }
            return res.status(200).send('OK');
          }
        }

        state.plano = chosen.plan.charAt(0).toUpperCase() + chosen.plan.slice(1);
        state.valor = chosen.price;
        state.step = 'aguardando_comprovativo';

        await sendWhatsAppMessage(senderNum, `Excelente escolha! 🎉\n\n📦 *${state.plataforma} - ${state.plano}*\n💰 *Valor: ${chosen.price.toLocaleString('pt')} Kz*\n\n🏦 *DADOS PARA PAGAMENTO*\n📱 IBAN (BAI): ${IBAN}\n\nApós o pagamento, envie o comprovativo em *PDF* aqui! 📄`);
        return res.status(200).send('OK');
      }

      await sendWhatsAppMessage(senderNum, 'Por favor, escolha um dos planos:\n👤 *Individual*\n👥 *Partilha*\n👨‍👩‍👧 *Família*');
      return res.status(200).send('OK');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ ERRO GLOBAL:', error);
    res.status(200).send('Erro');
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Bot v8.0 (StreamZone - NLP + Slots) rodando na porta ${port}`));
