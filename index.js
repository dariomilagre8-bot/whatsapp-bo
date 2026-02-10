require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==================== CONFIGURAÇÕES DE VENDAS ====================
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SUPERVISOR_NUMBER = process.env.SUPERVISOR_NUMBER + '@s.whatsapp.net';

// Preçário
const PRECARIO = `
💰 *PREÇÁRIO DE PERFIS*

🎬 *NETFLIX*
• 1 Perfil: 3.500 Kz/mês

📺 *PRIME VIDEO*
• 1 Perfil: 2.500 Kz/mês

✅ Acesso imediato após confirmação do pagamento!
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
const clientStates = {}; // Estado de cada cliente no fluxo de vendas
const pendingVerifications = {}; // Comprovativos pendentes de verificação

// Agente para ignorar erro de certificado SSL
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// ==================== FUNÇÕES AUXILIARES ====================

// Buscar perfis disponíveis da Google Sheets
async function fetchAvailableProfiles(plataforma = null) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Página1!A:F?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length <= 1) {
      return [];
    }

    // Ignorar cabeçalho (primeira linha)
    const rows = data.values.slice(1);

    // Filtrar perfis disponíveis
    const availableProfiles = rows
      .map((row, index) => ({
        rowIndex: index + 2, // +2 porque: +1 para cabeçalho, +1 porque Sheets começa em 1
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || ''
      }))
      .filter(profile => profile.status.toLowerCase() === 'disponível' || profile.status.toLowerCase() === 'disponivel');

    // Filtrar por plataforma se especificado
    if (plataforma) {
      return availableProfiles.filter(p =>
        p.plataforma.toLowerCase().includes(plataforma.toLowerCase())
      );
    }

    return availableProfiles;
  } catch (error) {
    console.error('Erro ao buscar perfis:', error);
    return [];
  }
}

// Atualizar status do perfil na planilha
async function updateProfileStatus(rowIndex, newStatus) {
  // Nota: Para atualizar a planilha, seria necessário usar OAuth2 ou Service Account
  // Com apenas API Key, só é possível ler dados públicos
  // Esta função serve como placeholder para futura implementação
  console.log(`[INFO] Perfil na linha ${rowIndex} marcado como: ${newStatus}`);
  return true;
}

// Enviar mensagem via Evolution API
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
    console.log(`Mensagem enviada para ${number}`);
    return true;
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error.message);
    return false;
  }
}

// Encaminhar para supervisor
async function forwardToSupervisor(clientNumber, message, isPaymentProof = false) {
  const clientId = clientNumber.replace('@s.whatsapp.net', '');
  let supervisorMessage;

  if (isPaymentProof) {
    supervisorMessage = `📩 *COMPROVATIVO RECEBIDO*\n\n👤 Cliente: ${clientId}\n\n${message}\n\n✅ Responda "verificado ${clientId}" para aprovar\n❌ Responda "não verificado ${clientId}" para rejeitar`;
  } else {
    supervisorMessage = `❓ *PERGUNTA DO CLIENTE*\n\n👤 Cliente: ${clientId}\n\n💬 Mensagem: ${message}\n\n📝 Responda para eu encaminhar ao cliente.`;
  }

  await sendWhatsAppMessage(SUPERVISOR_NUMBER, supervisorMessage);
}

// Verificar se a mensagem é sobre vendas/perfis
function isAboutStreaming(text) {
  const keywords = ['netflix', 'prime', 'video', 'perfil', 'perfis', 'streaming', 'conta', 'contas', 'comprar', 'preço', 'preco', 'quanto custa', 'vaga', 'vagas', 'disponível', 'disponivel'];
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}

// Verificar se cliente quer coordenadas
function wantsBankDetails(text) {
  const keywords = ['coordenada', 'iban', 'banco', 'pagar', 'pagamento', 'transferir', 'multicaixa', 'express', 'como pago', 'dados bancários', 'dados bancarios'];
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}

// Verificar se é um comprovativo de pagamento
function isPaymentProof(messageData) {
  // Verificar se tem imagem/documento anexado
  if (messageData.message?.imageMessage || messageData.message?.documentMessage) {
    return true;
  }
  // Verificar texto que indica comprovativo
  const text = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
  const keywords = ['comprovativo', 'comprovante', 'transferi', 'paguei', 'pagamento feito', 'já paguei', 'ja paguei', 'enviado', 'fiz o pagamento'];
  return keywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Extrair número do cliente da mensagem do supervisor
function extractClientNumber(text) {
  const patterns = [
    /verificado\s+(\d+)/i,
    /não verificado\s+(\d+)/i,
    /nao verificado\s+(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] + '@s.whatsapp.net';
    }
  }
  return null;
}

// ==================== HANDLER PRINCIPAL ====================

app.post('/', async (req, res) => {
  try {
    const body = req.body;

    if (body.event === 'messages.upsert') {
      const messageData = body.data;

      if (messageData.key.fromMe) return res.status(200).send('Ignore self');

      const remoteJid = messageData.key.remoteJid;
      const textMessage = messageData.message?.conversation ||
                          messageData.message?.extendedTextMessage?.text || '';

      console.log(`Recebido de ${remoteJid}: ${textMessage}`);

      // ==================== VERIFICAR SE É RESPOSTA DO SUPERVISOR ====================
      if (remoteJid === SUPERVISOR_NUMBER) {
        const lowerText = textMessage.toLowerCase();

        // Verificar se é aprovação ou rejeição de pagamento
        if (lowerText.startsWith('verificado') || lowerText.startsWith('não verificado') || lowerText.startsWith('nao verificado')) {
          const clientNumber = extractClientNumber(textMessage);

          if (clientNumber && pendingVerifications[clientNumber]) {
            const plataforma = pendingVerifications[clientNumber].plataforma;

            if (lowerText.startsWith('verificado')) {
              // Buscar perfil disponível
              const profiles = await fetchAvailableProfiles(plataforma);

              if (profiles.length > 0) {
                const profile = profiles[0];
                const credentialsMessage = `
✅ *PAGAMENTO VERIFICADO!*

🎉 Aqui estão os dados do seu perfil:

📺 *Plataforma:* ${profile.plataforma}
📧 *Email:* ${profile.email}
🔑 *Senha:* ${profile.senha}
👤 *Nome do Perfil:* ${profile.nomePerfil}
🔢 *PIN:* ${profile.pin}

⚠️ *IMPORTANTE:*
• Não altere a senha
• Não mude o nome do perfil
• Use apenas o perfil indicado

Obrigado pela preferência! 🙏
                `;

                await sendWhatsAppMessage(clientNumber, credentialsMessage);
                await updateProfileStatus(profile.rowIndex, 'Vendido');

                // Limpar estado do cliente
                delete pendingVerifications[clientNumber];
                delete clientStates[clientNumber];

                await sendWhatsAppMessage(SUPERVISOR_NUMBER, `✅ Credenciais enviadas ao cliente ${clientNumber.replace('@s.whatsapp.net', '')}`);
              } else {
                await sendWhatsAppMessage(clientNumber, '❌ Desculpe, não há perfis disponíveis no momento para esta plataforma. Por favor, aguarde ou escolha outra opção.');
                await sendWhatsAppMessage(SUPERVISOR_NUMBER, `⚠️ Não há perfis disponíveis de ${plataforma} para o cliente.`);
              }
            } else {
              // Não verificado
              await sendWhatsAppMessage(clientNumber, '❌ O comprovativo não foi aprovado. Por favor, verifique se:\n\n• O valor está correto\n• A transferência foi concluída\n• Enviou o comprovativo correto\n\nTente novamente ou contacte o suporte.');
              delete pendingVerifications[clientNumber];
            }
          }
          return res.status(200).send('OK');
        }

        // Outras mensagens do supervisor (respostas a perguntas)
        // Implementar lógica de encaminhamento se necessário
        return res.status(200).send('OK');
      }

      // ==================== FLUXO DE VENDAS ====================

      // Inicializar estado do cliente se não existir
      if (!clientStates[remoteJid]) {
        clientStates[remoteJid] = { step: 'inicio' };
      }

      if (!chatHistories[remoteJid]) {
        chatHistories[remoteJid] = [];
      }

      let responseText = '';
      let shouldUseAI = true;

      // Verificar se é comprovativo de pagamento
      if (isPaymentProof(messageData) && clientStates[remoteJid].step === 'aguardando_comprovativo') {
        const plataforma = clientStates[remoteJid].plataforma;
        pendingVerifications[remoteJid] = { plataforma: plataforma, timestamp: Date.now() };

        await forwardToSupervisor(remoteJid, `Comprovativo de pagamento para ${plataforma}`, true);

        responseText = '📨 Comprovativo recebido!\n\nEstou a encaminhar para verificação. Aguarde alguns minutos, por favor. ⏳';
        shouldUseAI = false;
      }
      // Verificar se quer coordenadas bancárias
      else if (wantsBankDetails(textMessage) && (clientStates[remoteJid].step === 'escolheu_plataforma' || clientStates[remoteJid].step === 'informou_vagas')) {
        responseText = COORDENADAS_BANCARIAS;
        clientStates[remoteJid].step = 'aguardando_comprovativo';
        shouldUseAI = false;
      }
      // Verificar se escolheu plataforma
      else if (clientStates[remoteJid].step === 'perguntou_plataforma') {
        const lowerText = textMessage.toLowerCase();

        if (lowerText.includes('netflix')) {
          clientStates[remoteJid].plataforma = 'Netflix';
          clientStates[remoteJid].step = 'escolheu_plataforma';

          const profiles = await fetchAvailableProfiles('Netflix');
          if (profiles.length > 0) {
            responseText = `🎬 *NETFLIX*\n\n✅ Temos ${profiles.length} perfil(is) disponível(is)!\n\n${PRECARIO}\n\n📲 Quando quiser pagar, peça as coordenadas bancárias!`;
            clientStates[remoteJid].step = 'informou_vagas';
          } else {
            responseText = '😔 Infelizmente não temos perfis Netflix disponíveis no momento. Deseja verificar Prime Video?';
            clientStates[remoteJid].step = 'perguntou_plataforma';
          }
          shouldUseAI = false;
        }
        else if (lowerText.includes('prime') || lowerText.includes('amazon')) {
          clientStates[remoteJid].plataforma = 'Prime Video';
          clientStates[remoteJid].step = 'escolheu_plataforma';

          const profiles = await fetchAvailableProfiles('Prime');
          if (profiles.length > 0) {
            responseText = `📺 *PRIME VIDEO*\n\n✅ Temos ${profiles.length} perfil(is) disponível(is)!\n\n${PRECARIO}\n\n📲 Quando quiser pagar, peça as coordenadas bancárias!`;
            clientStates[remoteJid].step = 'informou_vagas';
          } else {
            responseText = '😔 Infelizmente não temos perfis Prime Video disponíveis no momento. Deseja verificar Netflix?';
            clientStates[remoteJid].step = 'perguntou_plataforma';
          }
          shouldUseAI = false;
        }
      }
      // Verificar se está perguntando sobre streaming/perfis
      else if (isAboutStreaming(textMessage)) {
        clientStates[remoteJid].step = 'perguntou_plataforma';
        responseText = `👋 Olá! Bem-vindo ao nosso serviço de streaming!

🎬 Temos perfis disponíveis de:
1️⃣ *Netflix*
2️⃣ *Prime Video*

Qual plataforma você prefere?`;
        shouldUseAI = false;
      }

      // Se não foi tratado pelas regras de vendas, usar IA
      if (shouldUseAI) {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // System prompt para a IA
        const systemPrompt = `Você é um assistente de vendas de perfis de streaming (Netflix e Prime Video).
Seja educado e prestativo. Se o cliente perguntar sobre perfis, streaming, preços ou compra, guie-o para escolher entre Netflix ou Prime Video.
Se não souber responder algo técnico ou específico sobre pagamentos, diga que vai encaminhar para o supervisor.
Responda sempre em português de forma simpática e profissional.`;

        const chat = model.startChat({
          history: chatHistories[remoteJid],
          systemInstruction: systemPrompt
        });

        const result = await chat.sendMessage(textMessage);
        responseText = result.response.text();

        // Verificar se a IA não sabe responder
        if (responseText.toLowerCase().includes('não sei') || responseText.toLowerCase().includes('não tenho certeza') || responseText.toLowerCase().includes('encaminhar')) {
          await forwardToSupervisor(remoteJid, textMessage, false);
          responseText += '\n\n📨 Já encaminhei sua dúvida para nossa equipe. Em breve terá uma resposta!';
        }

        chatHistories[remoteJid].push({
          role: "user",
          parts: [{ text: textMessage }]
        });

        chatHistories[remoteJid].push({
          role: "model",
          parts: [{ text: responseText }]
        });
      }

      // Enviar resposta
      if (responseText) {
        await sendWhatsAppMessage(remoteJid, responseText);
        console.log(`Resposta enviada: ${responseText.substring(0, 100)}...`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('ERRO:', error.message);
    if (error.response) {
      console.error('DETALHES:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(200).send('Erro processado');
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Bot de Vendas de Streaming rodando na porta ${port}`);
});

