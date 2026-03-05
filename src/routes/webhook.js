// src/routes/webhook.js — LLM-First pipeline (Agentic RAG)
// Sem matcher/regex/intenções: TODAS as mensagens de texto vão direto para o pipeline LLM (A→B→C→D).

const { sendText } = require('../engine/sender');
const llm = require('../engine/llm');
const { extractName } = require('../utils/name-extractor');
const { getClientByPhone } = require('../integrations/supabase');

/**
 * Cria o handler do webhook com pipeline estrito: A) Inventário B) Memória C) Prompt D) Resposta.
 * getInventoryFn: async () => string (dados do Google Sheets formatados para o prompt).
 * Não há router por intenções — apenas comandos de supervisor (#retomar, #status) e media (imagem/áudio) são tratados antes do LLM.
 */
function createWebhookHandler(config, stateMachine, getInventoryFn, evolutionConfig) {

  return async function handleWebhook(req, res) {
    res.status(200).json({ ok: true });

    try {
      const body = req.body;
      const data = body?.data;
      if (!data || !data.key || data.key.fromMe) return;

      const senderNum = data.key.remoteJid?.replace('@s.whatsapp.net', '');
      if (!senderNum || senderNum.includes('@g.us')) return;

      const pushName = data.pushName || '';
      const messageData = data.message || {};
      const textMessage = messageData.conversation
        || messageData.extendedTextMessage?.text
        || messageData.imageMessage?.caption
        || messageData.documentMessage?.caption
        || '';

      const isImage = !!messageData.imageMessage;
      const isDocument = !!messageData.documentMessage;
      const isAudio = !!(messageData.audioMessage || messageData.pttMessage);

      const supervisors = (process.env.SUPERVISOR_NUMBERS || process.env.SUPERVISOR_NUMBER || process.env.BOSS_NUMBER || '').split(',').map(s => s.trim());

      console.log(`\n📩 De: ${senderNum} (${pushName}) | Msg: "${textMessage.substring(0, 50)}" | Img: ${isImage} | Doc: ${isDocument} | Audio: ${isAudio}`);

      const session = stateMachine.getSession(senderNum);
      if (!session.name) session.name = extractName(pushName);

      // ── Comandos de supervisor (mantidos) ──
      if (supervisors.includes(senderNum)) {
        const cmd = config.supervisorCommands?.[textMessage.trim().toLowerCase()];
        if (cmd) {
          const parts = textMessage.trim().split(/\s+/);
          const target = parts[1] || null;
          if (cmd === 'unpause' && target) {
            const targetSession = stateMachine.getSession(target);
            targetSession.paused = false;
            stateMachine.setState(target, 'menu');
            await sendText(target, config.systemMessages?.botUnpaused ?? 'O responsável já tratou do assunto. Em que mais posso ajudar?', evolutionConfig);
            await sendText(senderNum, `✅ Bot retomado para ${target}`, evolutionConfig);
          } else if (cmd === 'status') {
            await sendText(senderNum, `📊 Sessões activas: ${stateMachine.sessions.size}`, evolutionConfig);
          }
          return;
        }
      }

      if (session.paused) {
        console.log(`[PAUSED] ${senderNum}: message ignored`);
        return;
      }

      // ── Roteamento de media: NUNCA chama a IA ──
      if (isAudio) {
        await sendText(senderNum, 'Desculpe, a Zara ainda não consegue ouvir mensagens de voz. 😅 Poderia escrever a sua dúvida, por favor? ✍️', evolutionConfig);
        return;
      }

      if (isImage) {
        await sendText(senderNum, 'Recebi a sua imagem! 📸 Se for um erro no seu ecrã (como o bloqueio da Netflix), o nosso suporte técnico já vai intervir para ajudar. 🛠️\n\n⚠️ Nota: Caso isto seja um comprovativo de pagamento, por favor, envie o ficheiro em formato PDF, pois o nosso sistema não processa fotografias.', evolutionConfig);
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        for (const sup of supervisors) {
          if (sup) await sendText(sup, `🔔 IMAGEM de ${senderNum} (${session.name})\nPlano: ${session.platform || 'N/A'} ${session.plan || 'N/A'}`, evolutionConfig);
        }
        return;
      }

      if (isDocument) {
        await sendText(senderNum, 'Recebi o seu ficheiro PDF! 📄 Vou encaminhar para o departamento financeiro validar o seu comprovativo. Assim que for aprovado, o supervisor libertará o seu acesso. Aguarde um momento, por favor. ⏳', evolutionConfig);
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        for (const sup of supervisors) {
          if (sup) await sendText(sup, `🔔 COMPROVATIVO PDF de ${senderNum} (${session.name})\nPlano: ${session.platform || 'N/A'} ${session.plan || 'N/A'}`, evolutionConfig);
        }
        return;
      }

      if (!textMessage.trim()) return;

      // ═══════════════════════════════════════════════════════════════
      // Pipeline LLM-First: A → B → C → D
      // ═══════════════════════════════════════════════════════════════

      // Passo A: Inventário atualizado (Google Sheets, por Plataforma + Plano + Valor)
      const inventoryString = await getInventoryFn();

      // Passo A+: Reconhecimento de cliente (Supabase)
      const { customerName, isReturningCustomer } = await getClientByPhone(senderNum);

      // Passo B: Últimas 5 mensagens (memória)
      const history = (session.history || []).slice(-5);

      // Passo C: Dynamic Prompt (com contexto do cliente) e chamada ao Gemini
      const systemInstruction = llm.buildDynamicPrompt(inventoryString, customerName, isReturningCustomer);
      const response = await llm.generate(systemInstruction, textMessage, history);

      // Passo D: Enviar resposta ao utilizador
      const finalResponse = response || (config.systemMessages?.unknownInput ?? 'Não compreendi. Pode reformular?');
      await sendText(senderNum, finalResponse, evolutionConfig);

      stateMachine.addToHistory(senderNum, 'user', textMessage);
      stateMachine.addToHistory(senderNum, 'model', finalResponse);

    } catch (err) {
      console.error('[WEBHOOK] Fatal error:', err);
    }
  };
}

module.exports = { createWebhookHandler };
