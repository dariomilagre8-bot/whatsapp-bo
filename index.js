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
const SUPERVISORS = (process.env.SUPERVISOR_NUMBER || '').split(',').map(num => num.trim() + '@s.whatsapp.net');

// Preçários
const PRECOS_NETFLIX = `🎬 *TABELA NETFLIX*\n👤 Individual: 5.000 Kz\n👥 Partilha: 9.000 Kz\n👨‍👩‍👧 Família: 13.500 Kz`;
const PRECOS_PRIME = `📺 *TABELA PRIME*\n👤 Individual: 3.000 Kz\n👥 Partilha: 5.500 Kz\n👨‍👩‍👧 Familiar: 8.000 Kz`;
const COORDENADAS = `🏦 *DADOS PARA PAGAMENTO*\n📱 IBAN (BAI): AO06.0040.0000.0000.0000.0000.0\n⚠️ Envie o PDF do comprovativo!`;

// ==================== ESTADOS & MEMÓRIA ====================
const chatHistories = {};
const clientStates = {}; 
const pendingVerifications = {}; // Guarda quem está à espera de aprovação
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ==================== FUNÇÕES GOOGLE SHEETS ====================

async function fetchBestProfile(plataforma, clientNumber) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Página1!A:G?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length <= 1) return null;

    const rows = data.values.slice(1);
    const cleanClientNum = clientNumber.replace('@s.whatsapp.net', '').trim();

    // 1. Tenta encontrar conta JÁ atribuída a este cliente (Renovação - Coluna G)
    const existingProfile = rows.map((row, index) => ({
        rowIndex: index + 2,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        dono: row[6] || ''
    })).find(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()) && p.dono.includes(cleanClientNum));

    if (existingProfile) {
        console.log(`[RENOVAÇÃO] Conta encontrada para ${cleanClientNum}`);
        return existingProfile;
    }

    // 2. Se não tem conta, busca uma Disponível
    const freeProfile = rows.map((row, index) => ({
        rowIndex: index + 2,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        dono: row[6] || ''
    })).find(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()) && p.status.toLowerCase().includes('dispon'));

    return freeProfile || null;

  } catch (error) {
    console.error('Erro Sheets:', error);
    return null;
  }
}

async function updateProfileStatus(rowIndex, newStatus) {
    // Simulação de atualização (aqui apenas logamos)
    console.log(`[VENDA] Linha ${rowIndex} atualizada.`);
    return true;
}

// ==================== WHATSAPP ====================

async function sendWhatsAppMessage(number, text) {
  try {
    await axios.post(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`, {
      number: number, text: text, delay: 1200
    }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, httpsAgent: httpsAgent });
    return true;
  } catch (e) { console.error('Erro envio:', e.message); return false; }
}

function extractClientNumber(text) {
  const match = text.match(/(\d{9,})/); 
  if (match) return match[0] + '@s.whatsapp.net';
  return null;
}

// ==================== SERVIDOR ====================

app.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (body.event !== 'messages.upsert') return res.status(200).send('OK');
    const messageData = body.data;
    if (messageData.key.fromMe) return res.status(200).send('Ignore self');

    const remoteJid = messageData.key.remoteJid;
    const textMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
    const isImage = !!messageData.message?.imageMessage;
    const isDoc = !!messageData.message?.documentMessage;

    console.log(`Msg de ${remoteJid}: ${textMessage}`);

    // --- 👮‍♂️ LÓGICA DO SUPERVISOR (SIMPLIFICADA) ---
    if (SUPERVISORS.includes(remoteJid)) {
      const lower = textMessage.toLowerCase().trim();
      const parts = lower.split(' ');
      const command = parts[0]; // sim, s, ok...

      // Verifica se é comando de Aprovação ou Rejeição
      let action = null; // 'approve' | 'reject'
      if (['sim', 's', 'ok', 'y', 'yes', 'aprovado', 'confirmado'].includes(command)) action = 'approve';
      if (['nao', 'n', 'no', 'rejeitado', 'negado'].includes(command)) action = 'reject';

      if (action) {
        // Tenta achar o número na mensagem (ex: "sim 923...")
        let targetClient = extractClientNumber(textMessage);

        // Se não escreveu número, vê se há APENAS UM pendente
        if (!targetClient) {
            const pendingList = Object.keys(pendingVerifications);
            if (pendingList.length === 1) {
                targetClient = pendingList[0]; // Assume o único que existe
            } else if (pendingList.length > 1) {
                await sendWhatsAppMessage(remoteJid, `⚠️ Tenho ${pendingList.length} pedidos pendentes. Por favor diga "sim 9xxxx" para eu saber qual é.`);
                return res.status(200).send('OK');
            } else {
                await sendWhatsAppMessage(remoteJid, `✅ Nenhum pedido pendente de momento.`);
                return res.status(200).send('OK');
            }
        }

        const pedido = pendingVerifications[targetClient];
        if (!pedido) {
            await sendWhatsAppMessage(remoteJid, "⚠️ Esse cliente não está na lista de pendentes.");
            return res.status(200).send('OK');
        }

        if (action === 'approve') {
            // APROVAR
            const profile = await fetchBestProfile(pedido.plataforma, targetClient);

            if (profile) {
                // SUCESSO - Envia conta
                const entrega = `✅ *PAGAMENTO APROVADO!*\n\nAqui estão os seus dados:\n\n📺 *${profile.plataforma}*\n📧 *Email:* ${profile.email}\n🔑 *Senha:* ${profile.senha}\n👤 *Perfil:* ${profile.nomePerfil}\n🔢 *Pin:* ${profile.pin}\n\nObrigado pela preferência!`;
                await sendWhatsAppMessage(targetClient, entrega);
                
                // Limpa
                delete pendingVerifications[targetClient];
                delete clientStates[targetClient];

                // Avisa Super
                await sendWhatsAppMessage(remoteJid, `✅ Entregue ao cliente ${targetClient.replace('@s.whatsapp.net','')}.`);
            } else {
                // STOCK ZERO - Avisa cliente e Super
                await sendWhatsAppMessage(targetClient, "✅ Pagamento recebido! O supervisor está a finalizar a sua conta e enviará em breve.");
                
                await sendWhatsAppMessage(remoteJid, `⚠️ *ALERTA DE STOCK ZERO*\n\nO cliente ${targetClient.replace('@s.whatsapp.net','')} pagou por *${pedido.plataforma}*, mas a planilha está vazia para ele.\n👉 Por favor, envie uma conta manualmente.`);
                
                // Limpa estado para o bot não bloquear, mas o supervisor tem de resolver
                delete pendingVerifications[targetClient];
                delete clientStates[targetClient]; 
            }
        } else {
            // REJEITAR
            await sendWhatsAppMessage(targetClient, "❌ O seu comprovativo não foi validado. Verifique se enviou o ficheiro correto.");
            delete pendingVerifications[targetClient];
            delete clientStates[targetClient]; // Liberta o cliente para tentar de novo
            await sendWhatsAppMessage(remoteJid, "❌ Rejeitado.");
        }
        return res.status(200).send('OK');
      }
    }

    // --- 👤 LÓGICA DO CLIENTE ---
    if (!SUPERVISORS.includes(remoteJid)) {
        
        if (!clientStates[remoteJid]) clientStates[remoteJid] = { step: 'inicio' };
        if (!chatHistories[remoteJid]) chatHistories[remoteJid] = [];

        // 🛑 BLOQUEIO DE ESPERA (Impede reinício do chat)
        if (clientStates[remoteJid].step === 'esperando_supervisor') {
            // Se o cliente falar enquanto espera, só dizemos para aguardar
            // Não processamos a mensagem como comando
            return res.status(200).send('OK');
        }

        let response = '';
        let shouldUseAI = true;

        // 1. Receber PDF
        if (clientStates[remoteJid].step === 'aguardando_comprovativo') {
            if (isDoc && messageData.message.documentMessage.mimetype === 'application/pdf') {
                const plat = clientStates[remoteJid].plataforma;
                
                // Guarda pedido
                pendingVerifications[remoteJid] = { plataforma: plat, timestamp: Date.now() };
                clientStates[remoteJid].step = 'esperando_supervisor'; // BLOQUEIA O CHAT

                // Avisa Super
                const cleanNum = remoteJid.replace('@s.whatsapp.net', '');
                const msgSuper = `📩 *NOVO PDF*\n👤 ${cleanNum}\n📦 ${plat}\n\nResponda:\n👍 *"sim"* para aprovar\n👎 *"não"* para rejeitar`;
                
                for (const s of SUPERVISORS) await sendWhatsAppMessage(s, msgSuper);
                
                response = '📄 Recebido! Aguarde, estamos a validar. ⏳';
                shouldUseAI = false;
            } else if (textMessage || isImage) {
                response = '⚠️ Por favor envie o comprovativo em **PDF** (Documento). Não aceitamos fotos.';
                shouldUseAI = false;
            }
        }

        // 2. Comandos de Venda
        else if (textMessage.toLowerCase().includes('netflix')) {
            clientStates[remoteJid].plataforma = 'Netflix';
            response = `${PRECOS_NETFLIX}\n\n✅ Disponível!\n\n${COORDENADAS}`;
            clientStates[remoteJid].step = 'aguardando_comprovativo';
            shouldUseAI = false;
        }
        else if (textMessage.toLowerCase().includes('prime')) {
            clientStates[remoteJid].plataforma = 'Prime Video';
            response = `${PRECOS_PRIME}\n\n✅ Disponível!\n\n${COORDENADAS}`;
            clientStates[remoteJid].step = 'aguardando_comprovativo';
            shouldUseAI = false;
        }

        // 3. IA
        if (shouldUseAI && clientStates[remoteJid].step !== 'esperando_supervisor') {
             try {
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: { parts: [{ text: "Vendedor de streaming. Curto. Netflix e Prime." }] } });
                const chat = model.startChat({ history: chatHistories[remoteJid] });
                const resAI = await chat.sendMessage(textMessage);
                response = resAI.response.text();
                chatHistories[remoteJid].push({ role: "user", parts: [{ text: textMessage }] });
                chatHistories[remoteJid].push({ role: "model", parts: [{ text: response }] });
            } catch (e) {
                if (!response) response = "Olá! Temos Netflix e Prime. Qual deseja?";
            }
        }

        if (response) await sendWhatsAppMessage(remoteJid, response);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('ERRO GERAL:', error);
    res.status(200).send('Erro');
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Bot Rápido rodando na porta ${port}`));