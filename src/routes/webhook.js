// src/routes/webhook.js — LLM-First pipeline (Agentic RAG)
// Sem matcher/regex/intenções: TODAS as mensagens de texto vão direto para o pipeline LLM (A→B→C→D).

const { sendText } = require('../engine/sender');
const llm = require('../engine/llm');
const { extractName } = require('../utils/name-extractor');
const { getClientByPhone } = require('../integrations/supabase');
const { allocateProfile } = require('../integrations/google-sheets');
const botSettings = require('../../config/bot_settings.json');

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

      // ── Comandos de supervisor NO TOPO: ignoram estado de pausa e não passam pelo LLM ──
      // Se o remetente for supervisor e a mensagem começar por #, executar comando e return imediato.
      if (supervisors.includes(senderNum) && (typeof textMessage === 'string' && textMessage.trim().startsWith('#'))) {
        const parts = textMessage.trim().split(/\s+/);
        const firstWord = (parts[0] || '').toLowerCase();
        const cmd = config.supervisorCommands?.[firstWord];
        const target = parts[1] || null;
        if (cmd) {
          if (cmd === 'unpause' && target) {
            const targetSession = stateMachine.getSession(target);
            targetSession.paused = false;
            stateMachine.setState(target, 'menu');
            await sendText(target, config.systemMessages?.botUnpaused ?? 'O responsável já tratou do assunto. Em que mais posso ajudar?', evolutionConfig);
            await sendText(senderNum, `✅ Bot retomado para ${target}`, evolutionConfig);
          } else if (cmd === 'reset_session') {
            let count = 0;
            if (target) {
              const targetSession = stateMachine.getSession(target);
              targetSession.paused = false;
              stateMachine.setState(target, 'menu');
              await sendText(target, config.systemMessages?.botUnpaused ?? 'O responsável já tratou do assunto. Em que mais posso ajudar?', evolutionConfig);
              count = 1;
              await sendText(senderNum, `✅ Reset/despausado: ${target} (1 número)`, evolutionConfig);
            } else {
              for (const [phone, s] of stateMachine.sessions) {
                s.paused = false;
                stateMachine.setState(phone, 'menu');
                count++;
              }
              await sendText(senderNum, `✅ DESPAUSAR TODOS: ${count} número(s) libertados. A IA volta a responder a todos.`, evolutionConfig);
            }
            console.log(`[SUPERVISOR] #reset by ${senderNum}: ${count} session(s) unpaused`);
          } else if (cmd === 'status') {
            const pausedCount = [...stateMachine.sessions.values()].filter(s => s.paused).length;
            await sendText(senderNum, `📊 Sessões activas: ${stateMachine.sessions.size} | Pausadas: ${pausedCount}`, evolutionConfig);
          } else if (cmd === 'approve_sale' && target) {
            const targetSession = stateMachine.getSession(target);
            const pendingSale = targetSession.pendingSale;
            if (!pendingSale) {
              const metaTag = botSettings.metadata_tag || '#RESUMO_VENDA';
              await sendText(senderNum, `⚠️ O cliente ${target} não tem venda pendente (${metaTag}). Verifique a conversa.`, evolutionConfig);
              return;
            }
            const customerName = targetSession.name || 'Cliente';
            const credentials = await allocateProfile(config.stock, pendingSale, customerName, target);
            if (!credentials || (!credentials.email && !credentials.senha)) {
              await sendText(senderNum, `❌ Não foi possível alocar perfil na planilha (stock ou formato). pendingSale: ${pendingSale}`, evolutionConfig);
              return;
            }
            const accessMsg = `Pagamento aprovado! 🎉 Aqui estão os seus dados de acesso:\n*Email:* ${credentials.email || 'Aguardando Dados'}\n*Senha:* ${credentials.senha || 'Aguardando Dados'}${credentials.pin ? `\n*PIN:* ${credentials.pin}` : ''}\n\nMuito obrigado pela preferência!`;
            await sendText(target, accessMsg, evolutionConfig);
            targetSession.paused = false;
            targetSession.pendingSale = null;
            stateMachine.setState(target, 'menu');
            await sendText(senderNum, `✅ Venda concluída e planilha atualizada com sucesso. Dados enviados a ${target}.`, evolutionConfig);
            console.log(`[SUPERVISOR] #sim: venda aprovada para ${target}, perfil alocado`);
          }
          return;
        }
      }

      const session = stateMachine.getSession(senderNum);
      if (!session.name) session.name = extractName(pushName);

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
        const imgSaleInfo = session.pendingSale || `${session.platform || 'Aguardando Dados'} ${session.plan || ''}`.trim();
        for (const sup of supervisors) {
          if (sup) await sendText(sup, `🔔 IMAGEM de ${senderNum} (${session.name || 'Cliente'})\nPlano: ${imgSaleInfo}`, evolutionConfig);
        }
        return;
      }

      if (isDocument) {
        // Validação restrita: aceitar APENAS ficheiros com extensão .pdf ou mimetype application/pdf
        const docMsg = messageData.documentMessage || {};
        const fileName = (docMsg.fileName || '').toLowerCase();
        const mimetype = (docMsg.mimetype || '').toLowerCase();
        const isPdf = fileName.endsWith('.pdf') || mimetype === 'application/pdf';

        if (!isPdf) {
          await sendText(senderNum, 'Peço imensas desculpas, mas o meu sistema apenas consegue processar documentos em formato PDF. Poderia converter o seu ficheiro e reenviar, por favor? ✨', evolutionConfig);
          console.log(`[WEBHOOK] Documento rejeitado (não-PDF): fileName="${docMsg.fileName}" mimetype="${docMsg.mimetype}" de ${senderNum}`);
          return;
        }

        await sendText(senderNum, 'Recebi o seu ficheiro PDF! 📄 Vou encaminhar para o departamento financeiro validar o seu comprovativo. Assim que for aprovado, o supervisor libertará o seu acesso. Aguarde um momento, por favor. ⏳', evolutionConfig);
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        const saleInfo = session.pendingSale || `${session.platform || 'Aguardando Dados'} ${session.plan || ''}`.trim();
        for (const sup of supervisors) {
          if (sup) await sendText(sup, `🔔 COMPROVATIVO PDF de ${senderNum} (${session.name || 'Cliente'})\nPlano: ${saleInfo}`, evolutionConfig);
        }
        return;
      }

      if (!textMessage.trim()) return;

      // ═══════════════════════════════════════════════════════════════
      // Pipeline LLM-First: A → B → C → D
      // ═══════════════════════════════════════════════════════════════

      // Passo A: Inventário atualizado (Google Sheets — leitura exata de Plataforma + Plano + Valor)
      const inventoryString = await getInventoryFn();

      // Passo A+: Reconhecimento de cliente via Supabase (tabela clientes, coluna telefone)
      let customerName = null;
      let isReturningCustomer = false;
      try {
        ({ customerName, isReturningCustomer } = await getClientByPhone(senderNum));
      } catch (sbErr) {
        console.error('[SUPABASE] Falha ao consultar cliente:', sbErr.message);
      }
      console.log(`[CRM] ${senderNum} → cliente: ${customerName || 'NOVO'} | retornante: ${isReturningCustomer}`);

      // Passo B: Últimas 5 mensagens (memória)
      const history = (session.history || []).slice(-5);

      // Passo C: Dynamic Prompt (com contexto do cliente) e chamada ao Gemini
      const systemInstruction = llm.buildDynamicPrompt(inventoryString, customerName, isReturningCustomer);
      const response = await llm.generate(systemInstruction, textMessage, history);

      // Passo D: Resposta da IA e captura do metadata_tag (ex: #RESUMO_VENDA) para fluxo de aprovação (#sim)
      let finalResponse = response || (config.systemMessages?.unknownInput ?? 'Não compreendi. Pode reformular?');
      const metaTag = (botSettings.metadata_tag || '#RESUMO_VENDA').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const resumoRegex = new RegExp(`${metaTag}\\s*:\\s*([^\\n]*)`, 'i');
      const resumoMatch = finalResponse.match(resumoRegex);
      if (resumoMatch) {
        session.pendingSale = resumoMatch[1].trim();
        finalResponse = finalResponse.replace(new RegExp(`${metaTag}\\s*:[^\\n]*`, 'gi'), '').trim().replace(/\n{2,}/g, '\n');
        console.log(`[CPA] pendingSale guardado para ${senderNum}:`, session.pendingSale);
      }

      await sendText(senderNum, finalResponse, evolutionConfig);

      stateMachine.addToHistory(senderNum, 'user', textMessage);
      stateMachine.addToHistory(senderNum, 'model', finalResponse);

    } catch (err) {
      console.error('[WEBHOOK] Fatal error:', err);
    }
  };
}

module.exports = { createWebhookHandler };
