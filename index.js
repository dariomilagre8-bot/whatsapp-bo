require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==================== CONFIGURAÇÕES ====================
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

// 1. Limpa a lista de números
const RAW_SUPERVISORS = (process.env.SUPERVISOR_NUMBER || '').split(',').map(n => n.trim().replace(/\D/g, ''));

// 2. Separa quem é TELEFONE REAL de quem é ID DE COMPUTADOR (LID)
// Números de Angola têm 12 dígitos (244 + 9...). LIDs têm 15 ou mais.
const REAL_PHONES = RAW_SUPERVISORS.filter(n => n.length < 15);
const ALL_SUPERVISORS = RAW_SUPERVISORS;

// O Chefe Principal é o primeiro número real da lista
const MAIN_BOSS = REAL_PHONES.length > 0 ? REAL_PHONES[0] : null;

console.log('📱 Telefones Reais:', REAL_PHONES);
console.log('🖥️ Todos os IDs:', ALL_SUPERVISORS);
console.log('👑 Chefe Principal (Para onde vão os alertas):', MAIN_BOSS);

// Preçários
const PRECOS_NETFLIX = `🎬 *TABELA NETFLIX*\n👤 Individual: 5.000 Kz\n👥 Partilha: 9.000 Kz\n👨‍👩‍👧 Família: 13.500 Kz`;
const PRECOS_PRIME = `📺 *TABELA PRIME*\n👤 Individual: 3.000 Kz\n👥 Partilha: 5.500 Kz\n👨‍👩‍👧 Familiar: 8.000 Kz`;
const COORDENADAS = `🏦 *DADOS PARA PAGAMENTO*\n📱 IBAN (BAI): AO06.0040.0000.0000.0000.0000.0\n⚠️ Envie o PDF do comprovativo!`;

// ==================== ESTADOS ====================
const chatHistories = {};
const clientStates = {}; 
const pendingVerifications = {}; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ==================== FUNÇÕES ====================

function cleanNumber(jid) {
  return jid ? jid.replace(/\D/g, '') : '';
}

async function fetchBestProfile(plataforma, clientNumber) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Página1!A:G?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.values || data.values.length <= 1) return null;

    const rows = data.values.slice(1);
    const cleanClientNum = cleanNumber(clientNumber);

    // Renovação
    const existing = rows.map((row, index) => ({
        rowIndex: index + 2, plataforma: row[0]||'', email: row[1]||'', senha: row[2]||'', nomePerfil: row[3]||'', pin: row[4]||'', status: row[5]||'', dono: row[6]?cleanNumber(row[6]):''
    })).find(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()) && p.dono === cleanClientNum);

    if (existing) return existing;

    // Novo
    const free = rows.map((row, index) => ({
        rowIndex: index + 2, plataforma: row[0]||'', email: row[1]||'', senha: row[2]||'', nomePerfil: row[3]||'', pin: row[4]||'', status: row[5]||'', dono: row[6]||''
    })).find(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()) && p.status.toLowerCase().includes('dispon'));

    return free || null;
  } catch (error) {
    console.error('Erro Sheets:', error);
    return null;
  }
}

async function sendWhatsAppMessage(number, text) {
  try {
    let cleanTarget = cleanNumber(number);

    // 🚨 PROTEÇÃO ANTI-ERRO 400 🚨
    // Se tentarmos enviar para um LID (Computador), desviamos para o Telemóvel Principal
    if (cleanTarget.length > 14) {
        console.log(`⚠️ Tentativa de envio para PC (${cleanTarget}). Redirecionando para ${MAIN_BOSS}...`);
        if (MAIN_BOSS) {
            cleanTarget = MAIN_BOSS;
        } else {
            console.log('❌ Erro: Nenhum número real configurado para receber avisos.');
            return false;
        }
    }

    // Adiciona o sufixo correto
    const finalAddress = cleanTarget + '@s.whatsapp.net';

    await axios.post(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`, {
      number: finalAddress, text: text, delay: 1200
    }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, httpsAgent: httpsAgent });
    return true;
  } catch (e) { 
      console.error(`❌ FALHA ENVIO para ${number}:`);
      if(e.response) console.error(JSON.stringify(e.response.data));
      else console.error(e.message);
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
    const textMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
    const isDoc = !!messageData.message?.documentMessage;

    console.log(`📩 De: ${senderNum} | Msg: ${textMessage}`);

    // --- SUPERVISOR ---
    if (ALL_SUPERVISORS.includes(senderNum)) {
      console.log('👑 Supervisor detetado.');
      
      const lower = textMessage.toLowerCase().trim();
      const parts = lower.split(' ');
      const command = parts[0];

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
            await sendWhatsAppMessage(senderNum, "⚠️ Cliente não encontrado nos pendentes.");
            return res.status(200).send('OK');
        }

        if (action === 'approve') {
            await sendWhatsAppMessage(senderNum, "🔄 Aprovado! A processar..."); // O Bot vai mandar isto para o TELEFONE REAL
            
            const profile = await fetchBestProfile(pedido.plataforma, targetClient);
            if (profile) {
                const entrega = `✅ *PAGAMENTO APROVADO!*\n\nAqui estão os seus dados:\n\n📺 *${profile.plataforma}*\n📧 *Email:* ${profile.email}\n🔑 *Senha:* ${profile.senha}\n👤 *Perfil:* ${profile.nomePerfil}\n🔢 *Pin:* ${profile.pin}`;
                await sendWhatsAppMessage(targetClient, entrega);
                delete pendingVerifications[targetClient];
                delete clientStates[targetClient];
                await sendWhatsAppMessage(senderNum, `✅ Conta entregue ao cliente!`);
            } else {
                await sendWhatsAppMessage(targetClient, "✅ Pagamento recebido! O supervisor enviará a conta manualmente.");
                await sendWhatsAppMessage(senderNum, `⚠️ *SEM STOCK AUTOMÁTICO* para ${targetClient}. Envie manualmente!`);
                delete pendingVerifications[targetClient];
                delete clientStates[targetClient]; 
            }
        } else {
            await sendWhatsAppMessage(targetClient, "❌ Comprovativo inválido.");
            delete pendingVerifications[targetClient];
            delete clientStates[targetClient];
            await sendWhatsAppMessage(senderNum, "❌ Rejeitado.");
        }
      }
      return res.status(200).send('OK');
    }

    // --- CLIENTE ---
    // Ignora mensagens de PCs estranhos que não sejam supervisores
    if (senderNum.length > 13) return res.status(200).send('OK');

    if (!clientStates[senderNum]) clientStates[senderNum] = { step: 'inicio' };
    if (!chatHistories[senderNum]) chatHistories[senderNum] = [];

    if (clientStates[senderNum].step === 'esperando_supervisor') return res.status(200).send('OK');

    let response = '';
    let shouldUseAI = true;

    if (clientStates[senderNum].step === 'aguardando_comprovativo') {
        if (isDoc && messageData.message.documentMessage.mimetype === 'application/pdf') {
            const plat = clientStates[senderNum].plataforma;
            pendingVerifications[senderNum] = { plataforma: plat, timestamp: Date.now() };
            clientStates[senderNum].step = 'esperando_supervisor';

            // Envia para o Chefe Principal (para garantir entrega)
            if (MAIN_BOSS) {
                const msgSuper = `📩 *NOVO PDF*\n👤 Cliente: ${senderNum}\n📦 ${plat}\n\nResponda:\n👍 *"sim"* ou *"não"*`;
                await sendWhatsAppMessage(MAIN_BOSS, msgSuper);
            }
            
            response = '📄 Recebido! Aguarde a verificação. ⏳';
            shouldUseAI = false;
        } else if (textMessage || messageData.message?.imageMessage) {
            response = '⚠️ Por favor envie o comprovativo em **PDF**.';
            shouldUseAI = false;
        }
    }
    else if (textMessage.toLowerCase().includes('netflix')) {
        clientStates[senderNum].plataforma = 'Netflix';
        response = `${PRECOS_NETFLIX}\n\n✅ Disponível!\n\n${COORDENADAS}`;
        clientStates[senderNum].step = 'aguardando_comprovativo';
        shouldUseAI = false;
    }
    else if (textMessage.toLowerCase().includes('prime')) {
        clientStates[senderNum].plataforma = 'Prime Video';
        response = `${PRECOS_PRIME}\n\n✅ Disponível!\n\n${COORDENADAS}`;
        clientStates[senderNum].step = 'aguardando_comprovativo';
        shouldUseAI = false;
    }

    if (shouldUseAI) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: { parts: [{ text: "Vendedor streaming. Curto." }] } });
            const chat = model.startChat({ history: chatHistories[senderNum] });
            const resAI = await chat.sendMessage(textMessage);
            response = resAI.response.text();
            chatHistories[senderNum].push({ role: "user", parts: [{ text: textMessage }] });
            chatHistories[senderNum].push({ role: "model", parts: [{ text: response }] });
        } catch (e) {
            if (!response) response = "Olá! Temos Netflix e Prime. Qual deseja?";
        }
    }

    if (response) await sendWhatsAppMessage(senderNum, response);
    res.status(200).send('OK');

  } catch (error) { console.error('ERRO:', error); res.status(200).send('Erro'); }
});

app.listen(port, '0.0.0.0', () => console.log(`Bot v6.0 (Redirecionamento PC) rodando na porta ${port}`));