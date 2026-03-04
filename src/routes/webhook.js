// src/routes/webhook.js

const { findMatch } = require('../engine/matcher');
const { validate } = require('../engine/validator');
const { sendText } = require('../engine/sender');
const { handlers } = require('../engine/handlers');
const llm = require('../engine/llm');
const { extractName } = require('../utils/name-extractor');

function createWebhookHandler(config, stateMachine, stockFn, evolutionConfig, systemPrompt) {

  return async function handleWebhook(req, res) {
    // Responder 200 imediatamente
    res.status(200).json({ ok: true });

    try {
      const body = req.body;

      // ── Extrair dados da mensagem ──
      const data = body?.data;
      if (!data || !data.key || data.key.fromMe) return;

      const senderNum = data.key.remoteJid?.replace('@s.whatsapp.net', '');
      if (!senderNum || senderNum.includes('@g.us')) return; // Ignorar grupos

      const pushName = data.pushName || '';
      const messageData = data.message || {};
      const textMessage = messageData.conversation
        || messageData.extendedTextMessage?.text
        || messageData.imageMessage?.caption
        || messageData.documentMessage?.caption
        || '';

      const isImage = !!(messageData.imageMessage || messageData.documentMessage);
      const isAudio = !!(messageData.audioMessage || messageData.pttMessage);

      const supervisors = (process.env.SUPERVISOR_NUMBERS || process.env.SUPERVISOR_NUMBER || process.env.BOSS_NUMBER || '').split(',').map(s => s.trim());

      console.log(`\n📩 De: ${senderNum} (${pushName}) | Msg: "${textMessage.substring(0, 50)}" | Img: ${isImage} | Audio: ${isAudio}`);

      // ── Sessão ──
      const session = stateMachine.getSession(senderNum);

      // Definir nome na primeira interacção
      if (!session.name) {
        session.name = extractName(pushName);
      }

      console.log(`[STATE] ${senderNum}: state=${session.state}, platform=${session.platform}, paused=${session.paused}`);

      // ══════════════════════════════════════════
      // SUPERVISOR COMMANDS
      // ══════════════════════════════════════════
      if (supervisors.includes(senderNum)) {
        const cmd = config.supervisorCommands[textMessage.trim().toLowerCase()];
        if (cmd) {
          // Extrair telefone alvo (formato: #retomar 244xxx)
          const parts = textMessage.trim().split(/\s+/);
          const target = parts[1] || null;

          if (cmd === 'unpause' && target) {
            const targetSession = stateMachine.getSession(target);
            targetSession.paused = false;
            stateMachine.setState(target, 'menu');
            await sendText(target, config.systemMessages.botUnpaused, evolutionConfig);
            await sendText(senderNum, `✅ Bot retomado para ${target}`, evolutionConfig);
          } else if (cmd === 'status') {
            const info = `📊 Sessões activas: ${stateMachine.sessions.size}`;
            await sendText(senderNum, info, evolutionConfig);
          }
          return;
        }
        // Supervisor pode enviar mensagens normais ao bot — continuar
      }

      // ══════════════════════════════════════════
      // PAUSADO? IGNORAR
      // ══════════════════════════════════════════
      if (session.paused) {
        console.log(`[PAUSED] ${senderNum}: message ignored`);
        return;
      }

      // ══════════════════════════════════════════
      // CAMADA 0: MEDIA (imagem, áudio)
      // ══════════════════════════════════════════
      if (isImage) {
        if (session.state === 'aguardando_comprovativo') {
          // Comprovativo de pagamento
          await sendText(senderNum, config.systemMessages.imageInPaymentStep, evolutionConfig);
          // Notificar supervisor(es)
          for (const sup of supervisors) {
            await sendText(sup, `🔔 COMPROVATIVO de ${senderNum} (${session.name})\nPlano: ${session.platform} ${session.plan}`, evolutionConfig);
          }
          session.paused = true;
          stateMachine.setState(senderNum, 'pausado');
        } else {
          // Imagem fora de contexto — NÃO escalar, NÃO pausar
          await sendText(senderNum, config.systemMessages.imageOutOfContext, evolutionConfig);
        }
        return;
      }

      if (isAudio) {
        await sendText(senderNum, config.systemMessages.audioReceived, evolutionConfig);
        return;
      }

      // Sem texto? Ignorar
      if (!textMessage.trim()) return;

      // ══════════════════════════════════════════
      // CAMADA 1: RESPOSTAS FIXAS
      // ══════════════════════════════════════════
      const stock = await stockFn();
      const match = findMatch(textMessage, config.fixedResponses, session.state);

      if (match) {
        let response = null;
        let nextState = match.nextState || null;

        if (match.action === 'reply') {
          response = match.response;
        }
        else if (match.action === 'dynamic') {
          const handler = handlers[match.handler];
          if (handler) {
            const result = handler(session, config, stock, match.params || {});
            response = result.response;
            if (result.nextState) nextState = result.nextState;
          } else {
            console.error(`[HANDLER] Missing handler: ${match.handler}`);
            response = config.systemMessages.unknownInput;
          }
        }
        else if (match.action === 'escalate') {
          response = match.response;
          for (const sup of supervisors) {
            await sendText(sup, `🔔 ${(match.escalateType || 'geral').toUpperCase()} de ${senderNum} (${session.name}): "${textMessage}"`, evolutionConfig);
          }
          session.paused = true;
          nextState = 'pausado';
        }

        if (response) {
          // Anti-repetição
          if (response === session.lastResponse && match.id === session.lastResponseId) {
            response = 'Em que mais posso ajudá-lo(a)? 😊';
          }

          await sendText(senderNum, response, evolutionConfig);
          session.lastResponse = response;
          session.lastResponseId = match.id;

          if (nextState) {
            stateMachine.setState(senderNum, nextState);
          }

          stateMachine.addToHistory(senderNum, 'user', textMessage);
          stateMachine.addToHistory(senderNum, 'model', response);
          return;
        }
      }

      // ══════════════════════════════════════════
      // CAMADA 2: LÓGICA DE ESTADO (step-aware)
      // ══════════════════════════════════════════
      if (session.state === 'aguardando_comprovativo') {
        // Cliente está a conversar mas precisa de enviar comprovativo
        if (/\b(j[aá]\s*(paguei|transferi|fiz|enviei)|transferi|pago)\b/i.test(textMessage)) {
          await sendText(senderNum, 'Óptimo! Por favor envie o comprovativo (foto ou PDF) por aqui para podermos confirmar. 📎', evolutionConfig);
        } else if (/\b(netflix|prime|pre[çc]o|plano|quero)\b/i.test(textMessage)) {
          // Quer começar nova compra? Reset
          stateMachine.setState(senderNum, 'menu');
          // Re-processar a mensagem como se fosse menu
          const match2 = findMatch(textMessage, config.fixedResponses, 'menu');
          if (match2 && match2.action === 'dynamic' && handlers[match2.handler]) {
            const result = handlers[match2.handler](session, config, stock, match2.params || {});
            await sendText(senderNum, result.response, evolutionConfig);
            if (result.nextState) stateMachine.setState(senderNum, result.nextState);
            return;
          }
          await sendText(senderNum, config.systemMessages.alreadyWaitingProof, evolutionConfig);
        } else {
          await sendText(senderNum, config.systemMessages.alreadyWaitingProof, evolutionConfig);
        }
        return;
      }

      // ══════════════════════════════════════════
      // CAMADA 3: LLM (Gemini — ÚLTIMO recurso)
      // ══════════════════════════════════════════
      console.log(`[LLM] Falling to Gemini for: "${textMessage}"`);

      const contextPrompt = `${systemPrompt}\n\n[ESTADO ACTUAL: ${session.state}]\n[PLATAFORMA SELECCIONADA: ${session.platform || 'nenhuma'}]\n[NOME DO CLIENTE: ${session.name}]`;

      const llmResponse = await llm.generate(contextPrompt, textMessage, session.history);

      if (llmResponse) {
        // Validar resposta
        const validation = validate(llmResponse, config);
        const finalResponse = validation.valid ? llmResponse : validation.replacement;

        await sendText(senderNum, finalResponse, evolutionConfig);
        stateMachine.addToHistory(senderNum, 'user', textMessage);
        stateMachine.addToHistory(senderNum, 'model', finalResponse);
      } else {
        await sendText(senderNum, config.systemMessages.unknownInput, evolutionConfig);
      }

    } catch (err) {
      console.error('[WEBHOOK] Fatal error:', err);
    }
  };
}

module.exports = { createWebhookHandler };
