require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==================== CONFIGURAÇÕES ====================
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Página1';

// Google Sheets Auth (Service Account)
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheetsAPI = google.sheets({ version: 'v4', auth });

// Supervisores
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

const IBAN = 'AO06.0040.0000.0000.0000.0000.0';

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

// ==================== GOOGLE SHEETS ====================
async function fetchAllRows() {
  try {
    const res = await sheetsAPI.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:G`,
    });
    return res.data.values || [];
  } catch (error) {
    console.error('Erro fetchAllRows:', error.message);
    return [];
  }
}

async function updateSheetCell(row, column, value) {
  try {
    await sheetsAPI.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!${column}${row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[value]] },
    });
    return true;
  } catch (error) {
    console.error('Erro updateSheetCell:', error.message);
    return false;
  }
}

async function markProfileSold(rowIndex, clientNumber, pushName) {
  const label = pushName ? `${clientNumber} - ${pushName}` : clientNumber;
  await updateSheetCell(rowIndex, 'F', 'Indisponivel');
  await updateSheetCell(rowIndex, 'G', label);
}

async function markProfileAvailable(rowIndex) {
  await updateSheetCell(rowIndex, 'F', 'Disponivel');
  await updateSheetCell(rowIndex, 'G', '');
}

async function checkClientRenewal(clientNumber) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;
  const cleanNum = cleanNumber(clientNumber);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const dono = row[6] ? cleanNumber(row[6]) : '';
    if (dono === cleanNum) {
      return {
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        dono: row[6] || '',
        donoNome: (row[6] || '').split(' - ')[1] || ''
      };
    }
  }
  return null;
}

async function countAvailableStock(plataforma) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return 0;
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if ((row[0] || '').toLowerCase().includes(plataforma.toLowerCase()) &&
        (row[5] || '').toLowerCase().includes('dispon')) {
      count++;
    }
  }
  return count;
}

async function fetchBestProfile(plataforma, clientNumber) {
  try {
    const rows = await fetchAllRows();
    if (rows.length <= 1) return null;
    const dataRows = rows.slice(1);
    const cleanClientNum = cleanNumber(clientNumber);

    // Renovação - perfil já atribuído ao cliente
    const existing = dataRows.map((row, index) => ({
      rowIndex: index + 2,
      plataforma: row[0] || '', email: row[1] || '', senha: row[2] || '',
      nomePerfil: row[3] || '', pin: row[4] || '', status: row[5] || '',
      dono: row[6] ? cleanNumber(row[6]) : '', donoRaw: row[6] || '',
      isRenewal: true
    })).find(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()) && p.dono === cleanClientNum);

    if (existing) return existing;

    // Novo - perfil disponível
    const free = dataRows.map((row, index) => ({
      rowIndex: index + 2,
      plataforma: row[0] || '', email: row[1] || '', senha: row[2] || '',
      nomePerfil: row[3] || '', pin: row[4] || '', status: row[5] || '',
      dono: row[6] || '', donoRaw: row[6] || '',
      isRenewal: false
    })).find(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()) && p.status.toLowerCase().includes('dispon'));

    return free || null;
  } catch (error) {
    console.error('Erro fetchBestProfile:', error.message);
    return null;
  }
}

// ==================== PROMPT GEMINI ====================
const SYSTEM_PROMPT = `Tu és o assistente virtual da StreamZone, uma loja de contas de streaming (Netflix e Prime Video) em Angola.

REGRAS IMPORTANTES:
- NUNCA reveles o IBAN ou dados de pagamento antes do cliente escolher um plano
- NUNCA menciones comprovativos ou PDFs antes do cliente ter feito o pagamento
- Guia a conversa para o cliente escolher entre Netflix ou Prime Video
- Depois de escolher o serviço, ajuda a escolher o plano (Individual, Partilha ou Família)
- Sê caloroso, simpático e profissional
- Responde sempre em Português
- Máximo 3 frases por resposta
- Se o cliente perguntar algo fora do tema, redireciona educadamente para os nossos serviços`;

// ==================== ESTADOS ====================
const chatHistories = {};
const clientStates = {};
const pendingVerifications = {};
const pausedClients = {};
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ==================== FUNÇÕES AUXILIARES ====================
function cleanNumber(jid) {
  return jid ? jid.replace(/\D/g, '') : '';
}

async function sendWhatsAppMessage(number, text) {
  try {
    let cleanTarget = cleanNumber(number);

    // Proteção anti-erro 400: LIDs redirecionam para telefone principal
    if (cleanTarget.length > 14) {
      console.log(`⚠️ Envio para PC (${cleanTarget}) -> redirecionar para ${MAIN_BOSS}`);
      if (MAIN_BOSS) {
        cleanTarget = MAIN_BOSS;
      } else {
        console.log('❌ Nenhum número real configurado.');
        return false;
      }
    }

    const finalAddress = cleanTarget + '@s.whatsapp.net';
    await axios.post(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`, {
      number: finalAddress, text: text, delay: 1200
    }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, httpsAgent });
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
    const senderNum = cleanNumber(remoteJid);
    const pushName = messageData.pushName || '';
    const textMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
    const isDoc = !!messageData.message?.documentMessage;

    console.log(`📩 De: ${senderNum} (${pushName}) | Msg: ${textMessage}`);

    // ==================== SUPERVISOR ====================
    if (ALL_SUPERVISORS.includes(senderNum)) {
      console.log('👑 Supervisor detetado.');
      const lower = textMessage.toLowerCase().trim();
      const parts = lower.split(/\s+/);
      const command = parts[0];

      // --- Assumir cliente ---
      if (command === 'assumir' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        pausedClients[targetNum] = true;
        await sendWhatsAppMessage(senderNum, `⏸️ Bot pausado para ${targetNum}. Pode falar diretamente.`);
        return res.status(200).send('OK');
      }

      // --- Retomar cliente ---
      if (command === 'retomar' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        delete pausedClients[targetNum];
        await sendWhatsAppMessage(senderNum, `▶️ Bot reativado para ${targetNum}.`);
        return res.status(200).send('OK');
      }

      // --- Liberar perfil (desistência) ---
      if (command === 'liberar' && parts[1]) {
        const targetNum = parts[1].replace(/\D/g, '');
        const renewal = await checkClientRenewal(targetNum);
        if (renewal) {
          await markProfileAvailable(renewal.rowIndex);
          delete clientStates[targetNum];
          delete pendingVerifications[targetNum];
          delete chatHistories[targetNum];
          delete pausedClients[targetNum];
          await sendWhatsAppMessage(senderNum, `🔓 Perfil de ${targetNum} libertado (${renewal.plataforma}).`);
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
            await sendWhatsAppMessage(senderNum, `✅ Nada pendente.`);
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

          const profile = await fetchBestProfile(pedido.plataforma, targetClient);
          if (profile) {
            const entrega = `✅ *PAGAMENTO APROVADO!*\n\nAqui estão os seus dados:\n\n📺 *${profile.plataforma}*\n📧 *Email:* ${profile.email}\n🔑 *Senha:* ${profile.senha}\n👤 *Perfil:* ${profile.nomePerfil}\n🔢 *Pin:* ${profile.pin}\n\nObrigado por escolher a StreamZone! 🎉`;
            await sendWhatsAppMessage(targetClient, entrega);

            // Escrever na planilha (só para novos, renovações já estão marcadas)
            if (!profile.isRenewal) {
              await markProfileSold(profile.rowIndex, targetClient, pedido.pushName || '');
            }

            delete pendingVerifications[targetClient];
            delete clientStates[targetClient];
            delete chatHistories[targetClient];
            await sendWhatsAppMessage(senderNum, `✅ Conta entregue + planilha atualizada!`);
          } else {
            await sendWhatsAppMessage(targetClient, '✅ Pagamento recebido! O supervisor enviará a conta manualmente.');
            await sendWhatsAppMessage(senderNum, `⚠️ *SEM STOCK AUTOMÁTICO* para ${targetClient}. Envie manualmente!`);
            delete pendingVerifications[targetClient];
            delete clientStates[targetClient];
          }
        } else {
          // Rejeição - cliente volta a poder reenviar PDF
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
    // Ignora PCs estranhos que não sejam supervisores
    if (senderNum.length > 13) return res.status(200).send('OK');

    // Cliente pausado pelo supervisor (takeover)
    if (pausedClients[senderNum]) {
      console.log(`⏸️ ${senderNum} está pausado (supervisor assumiu).`);
      return res.status(200).send('OK');
    }

    // Inicializar estado
    if (!clientStates[senderNum]) clientStates[senderNum] = { step: 'inicio', pushName };
    if (!chatHistories[senderNum]) chatHistories[senderNum] = [];

    // Guardar pushName
    if (pushName && !clientStates[senderNum].pushName) {
      clientStates[senderNum].pushName = pushName;
    }

    const state = clientStates[senderNum];
    let response = '';

    // ---- STEP: esperando_supervisor ----
    if (state.step === 'esperando_supervisor') {
      response = '⏳ O seu comprovativo está a ser verificado. Por favor aguarde um momento!';
      await sendWhatsAppMessage(senderNum, response);
      return res.status(200).send('OK');
    }

    // ---- STEP: aguardando_comprovativo ----
    if (state.step === 'aguardando_comprovativo') {
      if (isDoc && messageData.message.documentMessage.mimetype === 'application/pdf') {
        pendingVerifications[senderNum] = {
          plataforma: state.plataforma,
          plano: state.plano,
          valor: state.valor,
          pushName: state.pushName,
          isRenewal: state.isRenewal || false,
          timestamp: Date.now()
        };
        state.step = 'esperando_supervisor';

        if (MAIN_BOSS) {
          const renewTag = state.isRenewal ? ' (RENOVAÇÃO)' : '';
          const msgSuper = `📩 *NOVO COMPROVATIVO*${renewTag}\n👤 Cliente: ${senderNum}${state.pushName ? ' (' + state.pushName + ')' : ''}\n📦 ${state.plataforma} - ${state.plano}\n💰 ${state.valor ? state.valor.toLocaleString('pt') + ' Kz' : 'N/A'}\n\nResponda: *sim* ou *nao*`;
          await sendWhatsAppMessage(MAIN_BOSS, msgSuper);
        }

        response = '📄 Comprovativo recebido! Estamos a verificar o seu pagamento. ⏳';
      } else if (textMessage || messageData.message?.imageMessage) {
        response = '⚠️ Por favor, envie o comprovativo em formato *PDF*.';
      }
      if (response) await sendWhatsAppMessage(senderNum, response);
      return res.status(200).send('OK');
    }

    // ---- STEP: inicio ----
    if (state.step === 'inicio') {
      // Verificar renovação primeiro
      const renewal = await checkClientRenewal(senderNum);
      if (renewal) {
        const svcKey = renewal.plataforma.toLowerCase().includes('netflix') ? 'netflix' : 'prime';
        const nome = renewal.donoNome || state.pushName || '';
        state.plataforma = renewal.plataforma;
        state.serviceKey = svcKey;
        state.isRenewal = true;
        state.step = 'escolha_plano';

        const saudacao = nome ? `Olá ${nome}! 👋` : 'Olá! 👋';
        response = `${saudacao}\n\nVejo que já é nosso cliente de *${renewal.plataforma}*! Quer renovar?\n\n${formatPriceTable(svcKey)}\n\nQual plano deseja? (Individual / Partilha / Família)`;
        await sendWhatsAppMessage(senderNum, response);
        return res.status(200).send('OK');
      }

      // Detetar serviço na mensagem
      const svc = detectService(textMessage);
      if (svc) {
        state.serviceKey = svc;
        state.plataforma = CATALOGO[svc].nome;

        // Verificar stock
        const stock = await countAvailableStock(state.plataforma);
        if (stock === 0) {
          response = `😔 De momento não temos *${state.plataforma}* disponível. Vamos notificá-lo assim que houver stock!`;
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *STOCK ESGOTADO* de ${state.plataforma}!\nCliente ${senderNum} (${state.pushName || 'sem nome'}) ficou sem atendimento.`);
          }
          state.step = 'inicio';
          await sendWhatsAppMessage(senderNum, response);
          return res.status(200).send('OK');
        }

        state.step = 'escolha_plano';
        response = `${formatPriceTable(svc)}\n\nQual plano deseja? (Individual / Partilha / Família)`;
        await sendWhatsAppMessage(senderNum, response);
        return res.status(200).send('OK');
      }

      // Sem keyword - AI guia conversa, avançar para escolha_servico
      state.step = 'escolha_servico';
      // Falls through to AI below
    }

    // ---- STEP: escolha_servico ----
    if (state.step === 'escolha_servico') {
      const svc = detectService(textMessage);
      if (svc) {
        state.serviceKey = svc;
        state.plataforma = CATALOGO[svc].nome;

        // Verificar stock
        const stock = await countAvailableStock(state.plataforma);
        if (stock === 0) {
          response = `😔 De momento não temos *${state.plataforma}* disponível. Vamos notificá-lo assim que houver stock!`;
          if (MAIN_BOSS) {
            await sendWhatsAppMessage(MAIN_BOSS, `⚠️ *STOCK ESGOTADO* de ${state.plataforma}!\nCliente ${senderNum} (${state.pushName || 'sem nome'}) ficou sem atendimento.`);
          }
          // Fica em escolha_servico para tentar outro serviço
          await sendWhatsAppMessage(senderNum, response);
          return res.status(200).send('OK');
        }

        state.step = 'escolha_plano';
        response = `${formatPriceTable(svc)}\n\nQual plano deseja? (Individual / Partilha / Família)`;
        await sendWhatsAppMessage(senderNum, response);
        return res.status(200).send('OK');
      }

      // Sem keyword - usar AI para guiar
      try {
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
        });
        const chat = model.startChat({ history: chatHistories[senderNum] });
        const resAI = await chat.sendMessage(textMessage || 'Olá');
        response = resAI.response.text();
        chatHistories[senderNum].push({ role: 'user', parts: [{ text: textMessage || 'Olá' }] });
        chatHistories[senderNum].push({ role: 'model', parts: [{ text: response }] });
      } catch (e) {
        console.error('Erro AI:', e.message);
        response = 'Olá! 👋 Bem-vindo à StreamZone! Temos *Netflix* e *Prime Video*. Qual te interessa?';
      }
      if (response) await sendWhatsAppMessage(senderNum, response);
      return res.status(200).send('OK');
    }

    // ---- STEP: escolha_plano ----
    if (state.step === 'escolha_plano') {
      const chosen = findPlan(state.serviceKey, textMessage);
      if (chosen) {
        state.plano = chosen.plan.charAt(0).toUpperCase() + chosen.plan.slice(1);
        state.valor = chosen.price;
        state.step = 'aguardando_comprovativo';

        response = `Excelente escolha! 🎉\n\n📦 *${state.plataforma} - ${state.plano}*\n💰 *Valor: ${chosen.price.toLocaleString('pt')} Kz*\n\n🏦 *DADOS PARA PAGAMENTO*\n📱 IBAN (BAI): ${IBAN}\n\nApós o pagamento, envie o comprovativo em *PDF* aqui! 📄`;
      } else {
        response = `Por favor, escolha um dos planos disponíveis:\n👤 *Individual*\n👥 *Partilha*\n👨‍👩‍👧 *Família*`;
      }
      await sendWhatsAppMessage(senderNum, response);
      return res.status(200).send('OK');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('ERRO:', error);
    res.status(200).send('Erro');
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Bot v7.0 (StreamZone) rodando na porta ${port}`));
