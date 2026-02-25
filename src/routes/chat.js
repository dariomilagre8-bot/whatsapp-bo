// POST /api/chat — ChatWidget do site (stock real no prompt)
const express = require('express');
const { countAvailableProfiles } = require('../../googleSheets');
const config = require('../config');
const { genAI, SYSTEM_PROMPT_CHAT_WEB_BASE, BOT_NAME } = config;
const branding = require('../../branding');

const router = express.Router();
const webChatHistories = {};

router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) return res.status(400).json({ reply: 'Dados em falta.' });
    if (!webChatHistories[sessionId]) webChatHistories[sessionId] = [];

    const [nfFull, nfShared, pvFull, pvShared] = await Promise.all([
      countAvailableProfiles('Netflix',      'full_account'),
      countAvailableProfiles('Netflix',      'shared_profile'),
      countAvailableProfiles('Prime Video',  'full_account'),
      countAvailableProfiles('Prime Video',  'shared_profile'),
    ]);
    const nfSlots = (nfFull || 0) + (nfShared || 0);
    const pvSlots = (pvFull || 0) + (pvShared || 0);
    const nfOk = nfSlots > 0;
    const pvOk = pvSlots > 0;

    const stockInfo = [
      nfOk ? `Netflix: ${nfSlots} perfil(s) disponível(is)` : `Netflix: ESGOTADO (0 disponíveis)`,
      pvOk ? `Prime Video: ${pvSlots} perfil(s) disponível(is)` : `Prime Video: ESGOTADO (0 disponíveis)`,
    ].join('\n');

    const catalogoLinhas = [];
    if (nfOk) catalogoLinhas.push(`Netflix: Individual ${branding.precos.netflix.individual.toLocaleString('pt')} Kz | Partilha ${branding.precos.netflix.partilha.toLocaleString('pt')} Kz | Família ${branding.precos.netflix.familia.toLocaleString('pt')} Kz`);
    if (pvOk) catalogoLinhas.push(`Prime Video: Individual ${branding.precos.prime.individual.toLocaleString('pt')} Kz | Partilha ${branding.precos.prime.partilha.toLocaleString('pt')} Kz | Família ${branding.precos.prime.familia.toLocaleString('pt')} Kz`);

    const catalogoBloco = catalogoLinhas.length > 0
      ? `CATÁLOGO DISPONÍVEL AGORA (apenas estes — não menciones outros):\n${catalogoLinhas.join('\n')}`
      : `CATÁLOGO: Nenhum serviço disponível de momento. Diz ao cliente que o stock está temporariamente esgotado e que pode deixar contacto no WhatsApp para ser avisado.`;

    const esgotados = [!nfOk && 'Netflix', !pvOk && 'Prime Video'].filter(Boolean);
    const avisoEsgotado = esgotados.length > 0 ? `\nSERVIÇOS ESGOTADOS (NÃO ofereças, NÃO digas que estão disponíveis): ${esgotados.join(', ')}` : '';

    const dynamicPrompt = `${SYSTEM_PROMPT_CHAT_WEB_BASE}\n\nSTOCK ACTUAL (não inventar):\n${stockInfo}\n\n${catalogoBloco}${avisoEsgotado}\n\nSe o cliente perguntar sobre disponibilidade ou quiser comprar, usa APENAS estes números reais. Se Netflix = 0: informa que está esgotado e sugere Prime Video se disponível.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const contents = [...webChatHistories[sessionId], { role: 'user', parts: [{ text: message }] }];
    const result = await model.generateContent({ contents, systemInstruction: { parts: [{ text: dynamicPrompt }] } });
    const reply = result.response.text();

    webChatHistories[sessionId].push({ role: 'user', parts: [{ text: message }] });
    webChatHistories[sessionId].push({ role: 'model', parts: [{ text: reply }] });
    if (webChatHistories[sessionId].length > 20) webChatHistories[sessionId] = webChatHistories[sessionId].slice(-20);
    setTimeout(() => { delete webChatHistories[sessionId]; }, 60 * 60 * 1000);

    res.json({ reply });
  } catch (e) {
    console.error('❌ Erro /api/chat:', e.message, e.stack);
    res.json({ reply: `Olá! Sou ${BOT_NAME}, assistente virtual da ${branding.nome}. Como posso ajudar? Fala connosco também pelo WhatsApp! 😊` });
  }
});

module.exports = router;
