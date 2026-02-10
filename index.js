require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==================== SELEÇÃO AUTOMÁTICA DE MODELO ====================
let CURRENT_MODEL_NAME = "gemini-1.5-flash"; // Padrão inicial

// Lista de prioridade (Do melhor para o mais simples)
const MODEL_PRIORITY = [
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.0-pro",
    "gemini-pro"
];

async function selectBestModel() {
    console.log("🔍 A testar modelos disponíveis...");
    
    for (const modelName of MODEL_PRIORITY) {
        try {
            console.log(`👉 Testando: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            // Teste simples para ver se responde
            await model.generateContent("Olá");
            
            console.log(`✅ SUCESSO! Modelo selecionado: ${modelName}`);
            CURRENT_MODEL_NAME = modelName;
            return; // Encontrou um bom, para por aqui
        } catch (error) {
            console.log(`❌ Falha no ${modelName}: ${error.message.split('[')[0]}`);
            // Continua para o próximo da lista
        }
    }
    console.log(`⚠️ Aviso: Nenhum teste passou. Usando o padrão: ${CURRENT_MODEL_NAME}`);
}

// Executar a seleção ao iniciar
selectBestModel();

// ==================== CONFIGURAÇÕES GERAIS ====================
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SUPERVISORS = (process.env.SUPERVISOR_NUMBER || '').split(',').map(num => num.trim() + '@s.whatsapp.net');

// Preçário
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

const COORDENADAS_BANCARIAS = `
🏦 *COORDENADAS BANCÁRIAS*
💳 *Multicaixa Express*: 946014060
📱 *IBAN (BAI)*: AO06.0040.0000.0000.0000.0000.0
• Titular: Nome do Titular
`;

const chatHistories = {};
const clientStates = {}; 
const pendingVerifications = {}; 
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ==================== FUNÇÕES ====================

async function fetchAvailableProfiles(plataforma = null) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Página1!A:F?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.values || data.values.length <= 1) return [];

    const rows = data.values.slice(1);
    const availableProfiles = rows.map((row, index) => ({
        rowIndex: index + 2, 
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || ''
      })).filter(profile => profile.status.toLowerCase().includes('dispon'));

    if (plataforma) return availableProfiles.filter(p => p.plataforma.toLowerCase().includes(plataforma.toLowerCase()));
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
      number: number, text: text, delay: 1200
    }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, httpsAgent: httpsAgent });
    return true;
  } catch (error) {
    console.error('Erro envio:', error.message);
    return false;
  }
}

async function forwardToSupervisor(clientNumber, message, isPaymentProof = false) {
  const clientId = clientNumber.replace('@s.whatsapp.net', '');
  const supervisorMessage = isPaymentProof 
    ? `📩 *COMPROVATIVO*\n👤: ${clientId}\n${message}\n✅ "verificado ${clientId}"\n❌ "não verificado ${clientId}"`
    : `❓ *PERGUNTA*\n👤: ${clientId}\n💬: ${message}`;
  
  for (const s of SUPERVISORS) await sendWhatsAppMessage(s, supervisorMessage);
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
    
    console.log(`Msg de ${remoteJid}: ${textMessage}`);

    // --- SUPERVISOR ---
    if (SUPERVISORS.includes(remoteJid)) {
      const lower = textMessage.toLowerCase();
      if (lower.includes('verificado')) {
        const clientMatch = textMessage.match(/\d+/); // Pega o primeiro numero que encontrar
        if (clientMatch) {
            const clientNumber = clientMatch[0] + '@s.whatsapp.net';
            if (pendingVerifications[clientNumber] && lower.startsWith('verificado')) {
                const plat = pendingVerifications[clientNumber].plataforma;
                const profiles = await fetchAvailableProfiles(plat);
                
                if (profiles.length > 0) {
                    const p = profiles[0];
                    await sendWhatsAppMessage(clientNumber, `✅ *SUCESSO!*\n📺 ${p.plataforma}\n📧 ${p.email}\n🔑 ${p.senha}\n👤 ${p.nomePerfil}\n🔢 ${p.pin}`);
                    await updateProfileStatus(p.rowIndex, 'Vendido');
                    delete pendingVerifications[clientNumber];
                    for (const s of SUPERVISORS) await sendWhatsAppMessage(s, `✅ Entrege ao cliente ${clientMatch[0]}`);
                } else {
                    await sendWhatsAppMessage(clientNumber, '❌ Sem stock. Aguarde.');
                    for (const s of SUPERVISORS) await sendWhatsAppMessage(s, `⚠️ Sem stock de ${plat}`);
                }
            }
        }
        return res.status(200).send('OK');
      }
    }

    // --- CLIENTES ---
    if (!SUPERVISORS.includes(remoteJid)) {
        if (!clientStates[remoteJid]) clientStates[remoteJid] = { step: 'inicio' };
        if (!chatHistories[remoteJid]) chatHistories[remoteJid] = [];

        let response = '';
        const lower = textMessage.toLowerCase();

        // 1. Verifica Comprovativo (Imagem ou Texto)
        const isProof = messageData.message?.imageMessage || lower.includes('paguei') || lower.includes('comprovativo');
        
        if (isProof && clientStates[remoteJid].step === 'aguardando_comprovativo') {
            const plat = clientStates[remoteJid].plataforma;
            pendingVerifications[remoteJid] = { plataforma: plat, timestamp: Date.now() };
            await forwardToSupervisor(remoteJid, `Comprovativo ${plat}`, true);
            response = '📨 Recebido! Aguarde verificação.';
        }
        // 2. Verifica Pedido de Banco
        else if (lower.includes('iban') || lower.includes('pagar') || lower.includes('conta') || lower.includes('banco')) {
            response = COORDENADAS_BANCARIAS;
            clientStates[remoteJid].step = 'aguardando_comprovativo';
        }
        // 3. Verifica Escolha de Plataforma
        else if (lower.includes('netflix')) {
            clientStates[remoteJid].plataforma = 'Netflix';
            const profs = await fetchAvailableProfiles('Netflix');
            response = profs.length > 0 ? `🎬 *NETFLIX*\n✅ Temos stock!\n${PRECARIO}\n📲 Digite "pagar" para receber o IBAN.` : '😔 Sem Netlfix no momento.';
            if (profs.length > 0) clientStates[remoteJid].step = 'informou_vagas';
        }
        else if (lower.includes('prime') || lower.includes('amazon')) {
            clientStates[remoteJid].plataforma = 'Prime Video';
            const profs = await fetchAvailableProfiles('Prime');
            response = profs.length > 0 ? `📺 *PRIME VIDEO*\n✅ Temos stock!\n${PRECARIO}\n📲 Digite "pagar" para receber o IBAN.` : '😔 Sem Prime no momento.';
            if (profs.length > 0) clientStates[remoteJid].step = 'informou_vagas';
        }
        // 4. IA (Se não for comando fixo)
        else {
            try {
                // USA O MODELO QUE FOI ESCOLHIDO AUTOMATICAMENTE
                const model = genAI.getGenerativeModel({ 
                    model: CURRENT_MODEL_NAME, 
                    systemInstruction: "Vendedor de Streaming. Curto e direto. Preços: Netflix 5000kz, Prime 3000kz."
                });
                const chat = model.startChat({ history: chatHistories[remoteJid] });
                const result = await chat.sendMessage(textMessage);
                response = result.response.text();
                chatHistories[remoteJid].push({ role: "user", parts: [{ text: textMessage }] });
                chatHistories[remoteJid].push({ role: "model", parts: [{ text: response }] });
            } catch (e) {
                console.error("Erro IA:", e);
                // Fallback simples se a IA falhar
                response = "Olá! 👋 Temos Netflix e Prime Video. Qual deseja?";
            }
        }

        if (response) await sendWhatsAppMessage(remoteJid, response);
    }
    
    res.status(200).send('OK');
  } catch (error) { console.error(error); res.status(200).send('Erro'); }
});

app.listen(port, '0.0.0.0', () => console.log(`🤖 Bot iniciado na porta ${port}`));