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

// LISTA DE SUPERVISORES (Apenas Números Limpos)
const SUPERVISOR_NUMBERS = (process.env.SUPERVISOR_NUMBER || '')
  .split(',')
  .map(num => num.trim().replace(/\D/g, '')); // Remove tudo que não for número

// Preçários
const PRECOS_NETFLIX = `🎬 *TABELA NETFLIX*\n👤 Individual: 5.000 Kz\n👥 Partilha: 9.000 Kz\n👨‍👩‍👧 Família: 13.500 Kz`;
const PRECOS_PRIME = `📺 *TABELA PRIME*\n👤 Individual: 3.000 Kz\n👥 Partilha: 5.500 Kz\n👨‍👩‍👧 Familiar: 8.000 Kz`;
const COORDENADAS = `🏦 *DADOS PARA PAGAMENTO*\n📱 IBAN (BAI): AO06.0040.0000.0000.0000.0000.0\n⚠️ Envie o PDF do comprovativo!`;

// ==================== ESTADOS & MEMÓRIA ====================
const chatHistories = {};
const clientStates = {}; 
const pendingVerifications = {}; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ==================== FUNÇÕES AUXILIARES ====================

// Função para limpar número (remove @s.whatsapp.net, +, espaços)
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

    // 1. Tenta encontrar conta JÁ atribuída a este cliente (Renovação)
    const existingProfile = rows.map((row, index) => ({
        rowIndex: index + 2,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        dono: row[6] ? cleanNumber(row[6]) : ''
    })).find(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()) && p.dono === cleanClientNum);

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

async function sendWhatsAppMessage(number, text) {
  try {
    // Garante que o número tem o sufixo correto para envio
    const formattedNumber = cleanNumber(number) + '@s.whatsapp.net';
    await axios.post(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`, {
      number: formattedNumber, text: text, delay: 1200
    }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, httpsAgent: httpsAgent });
    return true;
  } catch (e) { console.error('Erro envio:', e.message); return false; }
}

// ==================== SERVIDOR ====================

app.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (body.event !== 'messages.upsert') return res.status(200).send('OK');
    const messageData = body.data;
    if (messageData.key.fromMe) return res.status(200).send('Ignore self');

    const remoteJid = messageData.key.remoteJid;
    const senderNum = cleanNumber(remoteJid); // Número limpo de quem enviou
    const textMessage = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
    const isImage = !!messageData.message?.imageMessage;
    const isDoc = !!messageData.message?.documentMessage;

    console.log(`📩 Mensagem de: ${senderNum} | Texto: ${textMessage}`);

    // ============================================================
    // 👮‍♂️ LÓGICA DO SUPERVISOR (PRIORIDADE MÁXIMA)
    // ============================================================
    if (SUPERVISOR_NUMBERS.includes(senderNum)) {
      console.log('👑 Supervisor detectado!');
      
      const lower = textMessage.toLowerCase().trim();
      const parts = lower.split(' ');
      const command = parts[0];

      // Definição de Comandos
      let action = null; 
      if (['sim', 's', 'ok', 'y', 'yes', 'aprovado'].includes(command)) action = 'approve';
      if (['nao', 'n', 'no', 'rejeitado'].includes(command)) action = 'reject';

      if (action) {
        // Tenta achar o número do cliente na mensagem do supervisor
        let targetClientNum = textMessage.match(/\d{9,}/) ? textMessage.match(/\d{9,}/)[0] : null;

        // Se não escreveu número, tenta pegar o ÚNICO pendente
        if (!targetClientNum) {
            const pendingList = Object.keys(pendingVerifications);
            if (pendingList.length === 1) {
                targetClientNum = pendingList[0];
            } else if (pendingList.length > 1) {
                await sendWhatsAppMessage(remoteJid, `⚠️ Tenho ${pendingList.length} pedidos. Digite "sim 9xxxx" para confirmar qual.`);
                return res.status(200).send('OK');
            } else {
                await sendWhatsAppMessage(remoteJid, `✅ Nenhum pedido pendente.`);
                return res.status(200).send('OK');
            }
        }

        // Recupera dados do pedido
        const pedido = pendingVerifications[targetClientNum];
        if (!pedido) {
            await sendWhatsAppMessage(remoteJid, "⚠️ Cliente não encontrado nos pendentes.");
            return res.status(200).send('OK');
        }

        if (action === 'approve') {
            await sendWhatsAppMessage(remoteJid, "🔄 A processar entrega...");
            
            const profile = await fetchBestProfile(pedido.plataforma, targetClientNum);

            if (profile) {
                const entrega = `✅ *PAGAMENTO APROVADO!*\n\nAqui estão os seus dados:\n\n📺 *${profile.plataforma}*\n📧 *Email:* ${profile.email}\n🔑 *Senha:* ${profile.senha}\n👤 *Perfil:* ${profile.nomePerfil}\n🔢 *Pin:* ${profile.pin}\n\nBom filme! 🍿`;
                await sendWhatsAppMessage(targetClientNum, entrega);
                
                delete pendingVerifications[targetClientNum];
                delete clientStates[targetClientNum];

                await sendWhatsAppMessage(remoteJid, `✅ Conta enviada para ${targetClientNum}.`);
            } else {
                await sendWhatsAppMessage(targetClientNum, "✅ Pagamento recebido! O supervisor enviará a conta manualmente em breve.");
                await sendWhatsAppMessage(remoteJid, `⚠️ *SEM STOCK AUTOMÁTICO*\n\nO cliente ${targetClientNum} pagou ${pedido.plataforma}. Envie manualmente!`);
                
                delete pendingVerifications[targetClientNum];
                delete clientStates[targetClientNum]; 
            }
        } else {
            await sendWhatsAppMessage(targetClientNum, "❌ Comprovativo inválido ou não legível.");
            delete pendingVerifications[targetClientNum];
            delete clientStates[targetClientNum]; // Desbloqueia
            await sendWhatsAppMessage(remoteJid, "❌ Pedido rejeitado.");
        }
      } else {
          // Se o supervisor falar algo que não é comando, o bot avisa em vez de tentar vender
          await sendWhatsAppMessage(remoteJid, "🤖 Sou o Bot. Comandos: 'sim' para aprovar, 'não' para rejeitar.");
      }
      return res.status(200).send('OK'); // IMPEDE QUE O CÓDIGO DO CLIENTE CORRA
    }

    // ============================================================
    // 👤 LÓGICA DO CLIENTE
    // ============================================================
    
    // (O código só chega aqui se NÃO for supervisor)
    
    // Inicializa
    if (!clientStates[senderNum]) clientStates[senderNum] = { step: 'inicio' };
    if (!chatHistories[senderNum]) chatHistories[senderNum] = [];

    // 🛑 BLOQUEIO: Se estiver à espera, ignora mensagens (exceto se demorar muito, aqui simplificado)
    if (clientStates[senderNum].step === 'esperando_supervisor') {
        return res.status(200).send('OK');
    }

    let response = '';
    let shouldUseAI = true;

    // 1. Receber PDF
    if (clientStates[senderNum].step === 'aguardando_comprovativo') {
        if (isDoc && messageData.message.documentMessage.mimetype === 'application/pdf') {
            const plat = clientStates[senderNum].plataforma;
            
            // Grava na memória usando o número LIMPO como chave
            pendingVerifications[senderNum] = { plataforma: plat, timestamp: Date.now() };
            clientStates[senderNum].step = 'esperando_supervisor';

            // Avisa Super
            const msgSuper = `📩 *NOVO PDF*\n👤 Cliente: ${senderNum}\n📦 Produto: ${plat}\n\nResponda:\n👍 *"sim"* para aprovar\n👎 *"não"* para rejeitar`;
            
            for (const sNum of SUPERVISOR_NUMBERS) {
                await sendWhatsAppMessage(sNum, msgSuper);
            }
            
            response = '📄 Recebido! Aguarde a verificação. ⏳';
            shouldUseAI = false;
        } else if (textMessage || isImage) {
            response = '⚠️ Por favor envie o comprovativo em **PDF**. Não aceitamos fotos.';
            shouldUseAI = false;
        }
    }

    // 2. Comandos de Venda
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

    // 3. IA
    if (shouldUseAI) {
            try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: { parts: [{ text: "Vendedor de streaming. Curto. Netflix e Prime." }] } });
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

  } catch (error) {
    console.error('ERRO GERAL:', error);
    res.status(200).send('Erro');
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Bot Blindado rodando na porta ${port}`));