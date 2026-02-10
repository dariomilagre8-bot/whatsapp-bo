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

// Lógica para Múltiplos Supervisores (separados por vírgula no .env)
const SUPERVISORS = (process.env.SUPERVISOR_NUMBER || '').split(',').map(num => num.trim() + '@s.whatsapp.net');

// Preçário Detalhado (Baseado nas Imagens)
const PRECARIO = `
💰 *TABELA DE PREÇOS OFICIAL*

🎬 *NETFLIX (Mensal)*
👤 *Individual* (1 Tela): *5.000 Kz*
👥 *Partilha* (2 Telas): *9.000 Kz*
👨‍👩‍👧 *Família* (3 Telas): *13.500 Kz*

📺 *PRIME VIDEO (Mensal - 4K HDR)*
👤 *Individual* (1 Disp.): *3.000 Kz*
👥 *Partilha* (2 Disp.): *5.500 Kz*
👨‍👩‍👧 *Familiar* (3 Disp.): *8.000 Kz*
✅ *Inclui Download e Alta Definição*

⚡ Acesso imediato após confirmação!
`;

// Coordenadas bancárias
const COORDENADAS_BANCARIAS = `
🏦 *COORDENADAS BANCÁRIAS*

💳 *Multicaixa Express*
• Número: 946014060

📱 *Transferência Bancária*
• Banco: BAI
• IBAN: AO06.0040.0000.0000.0000.0000.0
• Titular: Nome do Titular

⚠️ Após o pagamento, envie o comprovativo aqui!
`;

// ==================== ARMAZENAMENTO ====================
const chatHistories = {};
const clientStates = {}; 
const pendingVerifications = {}; 

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ==================== FUNÇÕES AUXILIARES ====================

async function fetchAvailableProfiles(plataforma = null) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Página1!A:F?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length <= 1) return [];

    const rows = data.values.slice(1);
    const availableProfiles = rows
      .map((row, index) => ({
        rowIndex: index + 2, 
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || ''
      }))
      .filter(profile => profile.status.toLowerCase().includes('dispon'));

    if (plataforma) {
      return availableProfiles.filter(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()));
    }
    return availableProfiles;
  } catch (error) {
    console.error('Erro ao buscar perfis:', error);
    return [];
  }
}

async function updateProfileStatus(rowIndex, newStatus) {
  console.log(`[INFO] Perfil na linha ${rowIndex} marcado como: ${newStatus}`);
  return true;
}

async function sendWhatsAppMessage(number, text) {
  try {
    await axios.post(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`, {
      number: number,
      text: text,
      delay: 1200
    }, {
      headers: { 'apikey': process.env.EVOLUTION_API_KEY },
      httpsAgent: httpsAgent
    });
    return true;
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error.message);
    return false;
  }
}

// Envia para TODOS os supervisores
async function forwardToSupervisor(clientNumber, message, isPaymentProof = false) {
  const clientId = clientNumber.replace('@s.whatsapp.net', '');
  let supervisorMessage;
  if (isPaymentProof) {
    supervisorMessage = `📩 *COMPROVATIVO RECEBIDO*\n\n👤 Cliente: ${clientId}\n\n${message}\n\n✅ Responda "verificado ${clientId}" para aprovar\n❌ Responda "não verificado ${clientId}" para rejeitar`;
  } else {
    supervisorMessage = `❓ *PERGUNTA DO CLIENTE*\n\n👤 Cliente: ${clientId}\n\n💬 Mensagem: ${message}\n\n📝 Responda para eu encaminhar ao cliente.`;
  }
  
  for (const supervisor of SUPERVISORS) {
      await sendWhatsAppMessage(supervisor, supervisorMessage);
  }
}

function isAboutStreaming(text) {
  const keywords = ['netflix', 'prime', 'video', 'perfil', 'perfis', 'streaming', 'conta', 'contas', 'comprar', 'preço', 'vaga', 'disponível', 'tabela', 'pacote'];
  return keywords.some(keyword => text.toLowerCase().includes(keyword));
}

function wantsBankDetails(text) {
  const keywords = ['coordenada', 'iban', 'banco', 'pagar', 'pagamento', 'transferir', 'multicaixa', 'express', 'dados bancários'];
  return keywords.some(keyword => text.toLowerCase().includes(keyword));
}

function isPaymentProof(messageData) {
  if (messageData.message?.imageMessage || messageData.message?.documentMessage) return true;
  const text = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
  const keywords = ['comprovativo', 'comprovante', 'transferi', 'paguei', 'pagamento feito', 'já paguei', 'enviado'];
  return keywords.some(keyword => text.toLowerCase().includes(keyword));
}

function extractClientNumber(text) {
  const match = text.match(/(?:verificado|não verificado|nao verificado)\s+(\d+)/i);
  if (match) return match[1] + '@s.whatsapp.net';
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
    
    console.log(`Recebido de ${remoteJid}: ${textMessage}`);

    // --- LÓGICA DOS SUPERVISORES ---
    if (SUPERVISORS.includes(remoteJid)) {
      const lowerText = textMessage.toLowerCase();
      if (lowerText.startsWith('verificado') || lowerText.startsWith('nao verificado') || lowerText.startsWith('não verificado')) {
        const clientNumber = extractClientNumber(textMessage);
        if (clientNumber && pendingVerifications[clientNumber]) {
          const plataforma = pendingVerifications[clientNumber].plataforma;
          
          if (lowerText.startsWith('verificado')) {
            const profiles = await fetchAvailableProfiles(plataforma);
            if (profiles.length > 0) {
              const p = profiles[0];
              const msg = `✅ *PAGAMENTO VERIFICADO!*\n\n📺 *Plataforma:* ${p.plataforma}\n📧 *Email:* ${p.email}\n🔑 *Senha:* ${p.senha}\n👤 *Perfil:* ${p.nomePerfil}\n🔢 *PIN:* ${p.pin}\n\n⚠️ Não altere os dados!`;
              await sendWhatsAppMessage(clientNumber, msg);
              await updateProfileStatus(p.rowIndex, 'Vendido');
              delete pendingVerifications[clientNumber];
              delete clientStates[clientNumber];
              
              for (const s of SUPERVISORS) {
                  await sendWhatsAppMessage(s, `✅ Cliente ${clientNumber.replace('@s.whatsapp.net','')} atendido com sucesso.`);
              }
            } else {
              await sendWhatsAppMessage(clientNumber, '❌ Sem stock no momento. Aguarde.');
              for (const s of SUPERVISORS) await sendWhatsAppMessage(s, `⚠️ Sem stock de ${plataforma}.`);
            }
          } else {
            await sendWhatsAppMessage(clientNumber, '❌ Comprovativo rejeitado.');
            delete pendingVerifications[clientNumber];
          }
        }
        return res.status(200).send('OK');
      }
    }

    // --- LÓGICA DE VENDAS ---
    if (!SUPERVISORS.includes(remoteJid)) {
        if (!clientStates[remoteJid]) clientStates[remoteJid] = { step: 'inicio' };
        if (!chatHistories[remoteJid]) chatHistories[remoteJid] = [];

        let responseText = '';
        let shouldUseAI = true;

        if (isPaymentProof(messageData) && clientStates[remoteJid].step === 'aguardando_comprovativo') {
            const plataforma = clientStates[remoteJid].plataforma;
            pendingVerifications[remoteJid] = { plataforma: plataforma, timestamp: Date.now() };
            await forwardToSupervisor(remoteJid, `Comprovativo para ${plataforma}`, true);
            responseText = '📨 Comprovativo recebido! Aguarde a verificação. ⏳';
            shouldUseAI = false;
        }
        else if (wantsBankDetails(textMessage)) {
            responseText = COORDENADAS_BANCARIAS;
            clientStates[remoteJid].step = 'aguardando_comprovativo';
            shouldUseAI = false;
        }
        else if (isAboutStreaming(textMessage) || clientStates[remoteJid].step === 'perguntou_plataforma') {
            const lower = textMessage.toLowerCase();
            if (lower.includes('netflix')) {
                clientStates[remoteJid].plataforma = 'Netflix';
                const profiles = await fetchAvailableProfiles('Netflix');
                responseText = profiles.length > 0 ? `🎬 *NETFLIX*\n✅ Temos perfis disponíveis!\n${PRECARIO}\n📲 Peça as coordenadas para pagar!` : '😔 Sem vagas Netflix.';
                if (profiles.length > 0) clientStates[remoteJid].step = 'informou_vagas';
                shouldUseAI = false;
            } else if (lower.includes('prime') || lower.includes('amazon')) {
                clientStates[remoteJid].plataforma = 'Prime Video';
                const profiles = await fetchAvailableProfiles('Prime');
                responseText = profiles.length > 0 ? `📺 *PRIME VIDEO*\n✅ Temos perfis disponíveis!\n${PRECARIO}\n📲 Peça as coordenadas para pagar!` : '😔 Sem vagas Prime.';
                if (profiles.length > 0) clientStates[remoteJid].step = 'informou_vagas';
                shouldUseAI = false;
            } else {
                responseText = `👋 Bem-vindo!\n\n🎬 Temos perfis de:\n1️⃣ *Netflix*\n2️⃣ *Prime Video*\n\nQual deseja?`;
                clientStates[remoteJid].step = 'perguntou_plataforma';
                shouldUseAI = false;
            }
        }

        if (shouldUseAI) {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const chat = model.startChat({
                history: chatHistories[remoteJid],
                systemInstruction: "Você é um assistente de vendas. Preços Netflix: 5000, 9000, 13500. Prime: 3000, 5500, 8000. Seja breve."
            });
            const result = await chat.sendMessage(textMessage);
            responseText = result.response.text();
            
            chatHistories[remoteJid].push({ role: "user", parts: [{ text: textMessage }] });
            chatHistories[remoteJid].push({ role: "model", parts: [{ text: responseText }] });
        }

        if (responseText) await sendWhatsAppMessage(remoteJid, responseText);
    }
    
    res.status(200).send('OK');

  } catch (error) {
    console.error('ERRO:', error);
    res.status(200).send('Erro');
  }
});

app.listen(port, '0.0.0.0', () => console.log(`Bot de Vendas de Streaming rodando na porta ${port}`));