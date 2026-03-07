// src/routes/webhook.js — LLM-First pipeline (Agentic RAG)
// Sem matcher/regex/intenções: TODAS as mensagens de texto vão direto para o pipeline LLM (A→B→C→D).

const { sendText } = require('../engine/sender');
const llm = require('../engine/llm');
const { extractName } = require('../utils/name-extractor');
const { getClientByPhone } = require('../integrations/supabase');
const { allocateProfile, getStockCountsForPrompt, hasStockForPendingSale } = require('../integrations/google-sheets');
const botSettings = require('../../config/bot_settings.json');

const supervisorTestMode = new Set();

/** Mesma lógica de normalização: trim, lowercase, NFD, remove acentos. */
const normalizeText = (text) => text ? text.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';

/** Verifica se o remetente é o supervisor oficial (blindagem: só dígitos). */
const isSupervisor = (senderId) => {
  if (!senderId) return false;
  const cleanSender = senderId.toString()
    .replace(/[^0-9]/g, '');
  const rawEnv = process.env.SUPERVISOR_NUMBERS
    || process.env.SUPERVISOR_NUMBER
    || '244941713216';
  const adminNumbers = rawEnv.split(',')
    .map(s => s.trim().replace(/[^0-9]/g, ''))
    .filter(Boolean);
  return adminNumbers.some(admin =>
    cleanSender === admin ||
    cleanSender.includes(admin) ||
    admin.includes(cleanSender)
  );
};

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

      const rawJid = data.key.remoteJid || '';
      const senderNum = rawJid
        .replace(/@s\.whatsapp\.net$/, '')
        .replace(/@lid$/, '')
        .replace(/@.*$/, '');
      const replyJid = rawJid.includes('@')
        ? rawJid
        : `${rawJid}@s.whatsapp.net`;
      if (!senderNum || rawJid.endsWith('@g.us')) return;

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

      const supervisors = (process.env.SUPERVISOR_NUMBERS || process.env.SUPERVISOR_NUMBER || '244941713216').split(',').map(s => s.trim()).filter(Boolean);

      console.log(`\n📩 De: ${senderNum} (${pushName}) | Msg: "${textMessage.substring(0, 50)}" | Img: ${isImage} | Doc: ${isDocument} | Audio: ${isAudio}`);

      // ── Interceptador global: #sim / #nao incompletos NUNCA chegam à Zara ──
      const partsBody = (typeof textMessage === 'string' ? textMessage : '').trim().split(/\s+/).filter(Boolean);
      const firstToken = partsBody[0] ? normalizeText(partsBody[0]) : '';
      const hasTarget = !!partsBody[1];
      if (isSupervisor(senderNum) && (firstToken === '#sim' || firstToken === '#nao') && !hasTarget) {
        await sendText(replyJid, 'Comando incompleto. Por favor, use: #sim [número_do_cliente] ou #nao [número_do_cliente]', evolutionConfig);
        return;
      }

      // ── Comandos de supervisor NO TOPO: ignoram estado de pausa e não passam pelo LLM ──
      if (isSupervisor(senderNum) && (typeof textMessage === 'string' && textMessage.trim().startsWith('#'))) {
        const parts = textMessage.trim().split(/\s+/);
        const firstWord = (parts[0] || '').toLowerCase();
        if (firstWord === '#teste') {
          const modo = (parts[1] || '').toLowerCase();
          if (modo === 'on') {
            supervisorTestMode.add(senderNum);
            await sendText(replyJid,
              '🧪 Modo teste ON. As tuas mensagens sem # ' +
              'serão tratadas como cliente. ' +
              'Envia "#teste off" para sair.',
              evolutionConfig);
          } else if (modo === 'off') {
            supervisorTestMode.delete(senderNum);
            await sendText(replyJid,
              '✅ Modo teste OFF. Voltaste ao modo supervisor.',
              evolutionConfig);
          }
          return;
        }
      }

      if (isSupervisor(senderNum) && (typeof textMessage === 'string' && textMessage.trim().startsWith('#')) && !supervisorTestMode.has(senderNum)) {
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
            await sendText(replyJid, `✅ Bot retomado para ${target}`, evolutionConfig);
          } else if (cmd === 'reset_session') {
            let count = 0;
            if (target) {
              const targetSession = stateMachine.getSession(target);
              targetSession.paused = false;
              stateMachine.setState(target, 'menu');
              await sendText(target, config.systemMessages?.botUnpaused ?? 'O responsável já tratou do assunto. Em que mais posso ajudar?', evolutionConfig);
              count = 1;
              await sendText(replyJid, `✅ Reset/despausado: ${target} (1 número)`, evolutionConfig);
            } else {
              for (const [phone, s] of stateMachine.sessions) {
                s.paused = false;
                stateMachine.setState(phone, 'menu');
                count++;
              }
              await sendText(replyJid, `✅ DESPAUSAR TODOS: ${count} número(s) libertados. A IA volta a responder a todos.`, evolutionConfig);
            }
            console.log(`[SUPERVISOR] #reset by ${senderNum}: ${count} session(s) unpaused`);
          } else if (cmd === 'status') {
            const pausedCount = [...stateMachine.sessions.values()].filter(s => s.paused).length;
            await sendText(replyJid, `📊 Sessões activas: ${stateMachine.sessions.size} | Pausadas: ${pausedCount}`, evolutionConfig);
          } else if (cmd === 'approve_sale' && target) {
            const targetSession = stateMachine.getSession(target);
            const pendingSale = targetSession.pendingSale;
            if (!pendingSale) {
              const metaTag = botSettings.metadata_tag || '#RESUMO_VENDA';
              await sendText(replyJid, `O cliente ${target} não tem venda pendente (${metaTag}). Verifique a conversa.`, evolutionConfig);
              return;
            }
            const stillHasStock = await hasStockForPendingSale(config.stock, pendingSale);
            if (!stillHasStock) {
              await sendText(replyJid, `Erro: Stock esgotou. Venda cancelada para evitar duplicidade. Cliente: ${target}`, evolutionConfig);
              return;
            }
            const customerName = targetSession.name || 'Cliente';
            const credentials = await allocateProfile(config.stock, pendingSale, customerName, target);
            if (!credentials || (!credentials.email && !credentials.senha)) {
              await sendText(replyJid, `Erro: Stock esgotou. Venda cancelada para evitar duplicidade. Cliente: ${target}`, evolutionConfig);
              return;
            }
            const perfisLine = (credentials.perfis && credentials.perfis.length > 1)
              ? `\n*Perfis:* ${credentials.perfis.map((p, i) => `Perfil ${i + 1}${p.pin ? ` (PIN ${p.pin})` : ''}`).join(', ')}`
              : (credentials.pin ? `\n*PIN:* ${credentials.pin}` : '');
            const accessMsg = `Pagamento aprovado. Aqui estão os seus dados de acesso:\n*Email:* ${credentials.email || 'Aguardando Dados'}\n*Senha:* ${credentials.senha || 'Aguardando Dados'}${perfisLine}\n\nObrigado pela preferência.`;
            const targetReplyJid = targetSession.replyJid || `${target}@s.whatsapp.net`;
            await sendText(targetReplyJid, accessMsg, evolutionConfig);
            targetSession.paused = false;
            targetSession.pendingSale = null;
            stateMachine.setState(target, 'menu');
            await sendText(replyJid, `Venda concluída e planilha atualizada. Dados enviados a ${target}.`, evolutionConfig);
            console.log(`[SUPERVISOR] #sim: venda aprovada para ${target}, perfil alocado`);
          } else if (cmd === 'reject_sale' && target) {
            const targetSession = stateMachine.getSession(target);
            const rejectMsg = 'Informamos que o departamento financeiro não conseguiu validar o seu comprovativo de pagamento. A sua reserva encontra-se suspensa. Por favor, verifique os dados da transferência e reenvie um comprovativo válido em PDF, ou contacte-nos para esclarecimentos.';
            const targetReplyJid = targetSession.replyJid || `${target}@s.whatsapp.net`;
            await sendText(targetReplyJid, rejectMsg, evolutionConfig);
            targetSession.paused = false;
            targetSession.pendingSale = null;
            stateMachine.setState(target, 'menu');
            await sendText(replyJid, `Rejeição enviada ao cliente ${target}. Sessão desbloqueada.`, evolutionConfig);
            console.log(`[SUPERVISOR] #nao: comprovativo rejeitado para ${target}`);
          }
          return;
        }
      }

      const session = stateMachine.getSession(senderNum);
      session.replyJid = replyJid;
      if (!session.name) session.name = extractName(pushName);

      if (session.paused) {
        console.log(`[PAUSED] ${senderNum}: message ignored`);
        return;
      }

      // ── Roteamento de media: NUNCA chama a IA ──
      if (isAudio) {
        await sendText(replyJid, 'Desculpe, a Zara ainda não consegue ouvir mensagens de voz. 😅 Poderia escrever a sua dúvida, por favor? ✍️', evolutionConfig);
        return;
      }

      if (isImage) {
        await sendText(replyJid, 'Recebi a sua imagem! 📸 Se for um erro no seu ecrã (como o bloqueio da Netflix), o nosso suporte técnico já vai intervir para ajudar. 🛠️\n\n⚠️ Nota: Caso isto seja um comprovativo de pagamento, por favor, envie o ficheiro em formato PDF, pois o nosso sistema não processa fotografias.', evolutionConfig);
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
          await sendText(replyJid, 'O sistema financeiro exige que o comprovativo seja enviado exclusivamente em formato PDF. Por favor, converta o seu ficheiro e reenvie o documento.', evolutionConfig);
          console.log(`[WEBHOOK] Documento rejeitado (não-PDF): fileName="${docMsg.fileName}" mimetype="${docMsg.mimetype}" de ${senderNum}`);
          return;
        }

            await sendText(replyJid, 'Recebi o seu ficheiro PDF! 📄 Vou encaminhar para o departamento financeiro validar o seu comprovativo. Assim que for aprovado, o supervisor libertará o seu acesso. Aguarde um momento, por favor. ⏳', evolutionConfig);
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        const customerName = session.name || 'Cliente';
        const planInfo = session.pendingSale || 'Aguardando Extração';
        for (const sup of supervisors) {
          if (sup) await sendText(sup, `COMPROVATIVO RECEBIDO\n\nCliente: ${customerName}\nPlano: ${planInfo}\n\n💡 PARA ENTREGAR: Responda com: #sim ${senderNum}\n🚫 PARA REJEITAR: Responda com: #nao ${senderNum}`, evolutionConfig);
        }
        return;
      }

      if (!textMessage.trim()) return;

      // ── Memória anti-amnésia: extrair quantidade (1, 2, 4, 5 ou uma, duas, etc.) e guardar na sessão ──
      const quantityMatch = (typeof textMessage === 'string' ? textMessage : '').match(/\b(1|2|4|5)\s*(pessoa|perfil|slot)?s?\b/i)
        || (typeof textMessage === 'string' ? textMessage : '').match(/\b(uma?|duas?|dois|quatro|cinco)\s*(pessoa|perfil)?s?\b/i);
      if (quantityMatch) {
        const word = (quantityMatch[1] || '').toLowerCase();
        const num = { '1': 1, '2': 2, '4': 4, '5': 5, 'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'dua': 2, 'quatro': 4, 'cinco': 5 }[word];
        if (num) session.detectedQuantity = num;
      }

      // ── Interceptor: pedido de humano ou reserva ──
      const humanPatterns = [
        /guardar/i, /reservar/i, /\breserva\b/i,
        /mais tarde/i, /amanhã pago/i, /amanha pago/i,
        /pode guardar/i, /guarda para mim/i,
        /pago depois/i, /pago amanhã/i,
        /falar com humano/i,
        /falar com o responsável/i,
        /falar com o responsavel/i,
        /quero falar com/i,
        /atendimento humano/i,
        /falar com pessoa/i,
        /chamar supervisor/i
      ];
      const isHumanRequest = humanPatterns.some(p => p.test(textMessage));

      if (isHumanRequest && !session.paused && !isSupervisor(senderNum)) {
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        const clientName = session.name || 'Cliente';
        const planoInfo = session.pendingSale ||
          `${session.platform || ''} ${session.plan || ''}`.trim() || 'sem plano activo';
        for (const sup of supervisors) {
          if (sup) await sendText(sup,
            `🙋 PEDIDO HUMANO\n\nCliente: ${clientName}\n` +
            `Número: ${senderNum}\nContexto: ${planoInfo}\n\n` +
            `💡 Para reactivar o bot: #retomar ${senderNum}`,
            evolutionConfig);
        }
        await sendText(replyJid,
          'Compreendo. Vou chamar o responsável para ' +
          'o(a) ajudar directamente. Por favor, aguarde.',
          evolutionConfig);
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // Pipeline LLM-First: A → B → C → D
      // ═══════════════════════════════════════════════════════════════

      // Passo A: Inventário atualizado + contagens de stock para verificação pré-pagamento (CPA)
      const inventoryString = await getInventoryFn();
      const stockCountsResult = await getStockCountsForPrompt(config.stock);

      // Passo A+: Reconhecimento de cliente via Supabase (tabela clientes, coluna whatsapp)
      let customerName = null;
      let isReturningCustomer = false;
      let lastSale = null;
      try {
        ({ customerName, isReturningCustomer, lastSale } = await getClientByPhone(senderNum));
      } catch (sbErr) {
        console.error('[SUPABASE] Falha ao consultar cliente:', sbErr.message);
      }
      console.log(`[CRM] ${senderNum} → cliente: ${customerName || 'NOVO'} | retornante: ${isReturningCustomer}`);

      let diasRestantes = null;
      if (lastSale?.data_expiracao) {
        const parts = lastSale.data_expiracao.split('/');
        const exp = parts.length === 3
          ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
          : new Date(lastSale.data_expiracao);
        if (!isNaN(exp)) {
          diasRestantes = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
        }
      }

      // Passo B: Últimas 5 mensagens (memória)
      const history = (session.history || []).slice(-5);

      // Passo C: Dynamic Prompt (com contexto do cliente + stock em tempo real + memória de quantidade + diasRestantes) e chamada ao Gemini
      const systemInstruction = llm.buildDynamicPrompt(inventoryString, customerName, isReturningCustomer, stockCountsResult, session, diasRestantes);
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

      await sendText(replyJid, finalResponse, evolutionConfig);

      stateMachine.addToHistory(senderNum, 'user', textMessage);
      stateMachine.addToHistory(senderNum, 'model', finalResponse);

    } catch (err) {
      console.error('[WEBHOOK] Fatal error:', err);
    }
  };
}

module.exports = { createWebhookHandler };
