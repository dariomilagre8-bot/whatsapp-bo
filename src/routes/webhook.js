// src/routes/webhook.js — LLM-First pipeline (Agentic RAG)
// Sem matcher/regex/intenções: TODAS as mensagens de texto vão direto para o pipeline LLM (A→B→C→D).

const { createLogger } = require('../utils/logger');
const logger = createLogger('webhook');
const { sendText } = require('../engine/sender');
const llm = require('../engine/llm');
const { extractName } = require('../utils/name-extractor');
const { extractPhoneNumber } = require('../utils/phone');
const { getClientByPhone } = require('../integrations/supabase');
const {
  allocateProfile,
  getStockCountsForPrompt,
  hasStockForPendingSale,
  getClienteByTelefone,
  getPerfisExpirados,
  findLinhaPorEmailPerfil,
  libertarPerfil,
  renovarClientePorTelefone,
} = require('../integrations/google-sheets');
const botSettings = require('../../config/bot_settings.json');
const {
  upsertLead,
  updateLeadStatus,
  registarCompra,
  addProdutoInteresse,
  getCrmResumo,
  getLeadDetalhe,
  marcarInactivos,
  handleLeads,
  checkClienteExistente,
} = require('../crm/leads');
const { addToWaitlist, getWaitlistResumo, handleWaitlist } = require('../stock/waitlist');
const { triggerStockReposto, notificarClientesWaitlist } = require('../stock/stock-notifier');
const { getStockResumo } = require('../stock/stock-summary');
const { runDailyRenewalJob } = require('../renewal/renewal-cron');
const { detectarReclamacao, detectarLocalizacao, gerarRespostaLocalizacao, formatarNotificacaoReclamacao } = require('../crm/complaints');
const clientesConfig = require('../../config/clientes');

const supervisorTestMode = new Set();

/** Rate limit: máx 2 respostas por 30 segundos por número */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 30000;
const RATE_LIMIT_MAX = 2;
function checkRateLimit(phone) {
  const now = Date.now();
  let entry = rateLimitMap.get(phone);
  if (!entry) {
    rateLimitMap.set(phone, { count: 1, firstTs: now });
    return true;
  }
  if (now - entry.firstTs > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(phone, { count: 1, firstTs: now });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

/** Mesma lógica de normalização: trim, lowercase, NFD, remove acentos. */
const normalizeText = (text) => text ? text.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';

/** Verifica se o remetente é supervisor (lista de números). */
const isSupervisorFromList = (senderId, adminNumbers) => {
  if (!senderId || !adminNumbers?.length) return false;
  const cleanSender = (senderId.toString()).replace(/[^0-9]/g, '');
  return adminNumbers.some(admin =>
    cleanSender === admin || cleanSender.includes(admin) || admin.includes(cleanSender)
  );
};

/**
 * Cria o handler do webhook com pipeline estrito: A) Inventário B) Memória C) Prompt D) Resposta.
 * getInventoryFn: async () => string (dados do Google Sheets formatados para o prompt).
 * Não há router por intenções — apenas comandos de supervisor (#retomar, #status) e media (imagem/áudio) são tratados antes do LLM.
 */
function createWebhookHandler(config, stateMachine, getInventoryFn, evolutionConfig) {

  return async function handleWebhook(req, res) {
    try {
      const bodySafe = req && req.body !== undefined ? (req.body || {}) : {};
      logger.debug('webhook recebido', { body: bodySafe });
    } catch (logErr) {
      logger.error('log entrada falhou', { error: logErr && logErr.message });
    }

    const body = req && req.body;
    const data = body && body.data;
    if (!data || !data.key) {
      res.status(200).send('OK');
      return;
    }
    if (data.key.fromMe) {
      res.status(200).json({ ok: true });
      return;
    }

    // Multi-instância: Evolution API envia instance no payload
    const instanceName = body?.instance || body?.instanceName || body?.provider?.instance || body?.data?.provider?.instance
      || process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'Zara-Teste';
    const clientConfig = clientesConfig[instanceName] || clientesConfig['Zara-Teste'];
    const supervisors = Array.isArray(clientConfig?.supervisores)
      ? clientConfig.supervisores
      : ['244941713216'];
    const evolutionConfigForInstance = { ...evolutionConfig, instance: instanceName };

    res.status(200).json({ ok: true });

    try {
      // Evolution API v2.3.0: quem enviou está em data.key.remoteJid. NUNCA usar req.body.sender (é o bot/instância).
      const remoteJid = data?.key?.remoteJid || '';
      const senderNum = remoteJid.replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '');

      if (!senderNum) {
        logger.warn('JID inválido ignorado', { remoteJid });
        return res.status(200).json({ status: 'ignored', reason: 'invalid_jid' });
      }

      logger.info('mensagem recebida', { senderNum, remoteJid });

      if (remoteJid.endsWith('@g.us')) return;
      const replyJid = remoteJid.includes('@')
        ? remoteJid
        : (senderNum ? `${senderNum}@s.whatsapp.net` : remoteJid);

      const pushName = (data.pushName != null ? String(data.pushName) : '') || '';
      const messageData = data.message || {};
      const rawText = messageData.conversation
        || (messageData.extendedTextMessage && messageData.extendedTextMessage.text)
        || (messageData.imageMessage && messageData.imageMessage.caption)
        || (messageData.documentMessage && messageData.documentMessage.caption);
      const textMessage = typeof rawText === 'string' ? rawText : '';

      const isImage = !!messageData.imageMessage;
      const isDocument = !!messageData.documentMessage;
      const isAudio = !!(messageData.audioMessage || messageData.pttMessage);

      console.log(`\n📩 De: ${senderNum} (${pushName}) | instância: ${instanceName} | Msg: "${textMessage.substring(0, 50)}" | Img: ${isImage} | Doc: ${isDocument} | Audio: ${isAudio}`);

      const cleanMsg = typeof textMessage === 'string' ? textMessage.trim().toLowerCase().replace(/\s+/g, ' ') : '';
      const parts = cleanMsg.split(/\s+/).filter(Boolean);
      const firstWord = (parts[0] === '#' && parts[1]) ? '#' + parts[1] : (parts[0] || '');
      const targetRaw = (parts[0] === '#' && parts[2]) ? parts[2] : (parts[1] || null);
      const restParts = (parts[0] === '#') ? parts.slice(2) : parts.slice(1);

      const isSup = isSupervisorFromList(senderNum, supervisors);
      const isCmd = cleanMsg.startsWith('#');

      // ── Interceptador global: #sim / #nao incompletos NUNCA chegam à Zara ──
      if (isSup && (firstWord === '#sim' || firstWord === '#nao') && !targetRaw) {
        await sendText(replyJid, 'Comando incompleto. Por favor, use: #sim [número_do_cliente] ou #nao [número_do_cliente]', evolutionConfigForInstance);
        return;
      }

      // ── Comandos de supervisor NO TOPO: ignoram estado de pausa e não passam pelo LLM ──
      if (isSup && isCmd) {
        if (firstWord === '#teste') {
          const modo = (restParts[0] || '').toLowerCase();
          if (modo === 'on') {
            supervisorTestMode.add(senderNum);
            await sendText(replyJid,
              '🧪 Modo teste ON. As tuas mensagens sem # ' +
              'serão tratadas como cliente. ' +
              'Envia "#teste off" para sair.',
              evolutionConfigForInstance);
          } else if (modo === 'off') {
            supervisorTestMode.delete(senderNum);
            await sendText(replyJid,
              '✅ Modo teste OFF. Voltaste ao modo supervisor.',
              evolutionConfigForInstance);
          }
          return;
        }
      }

      if (isSup && isCmd && !supervisorTestMode.has(senderNum)) {
        // ── Comandos CRM ──
        if (firstWord === '#leads') {
          try {
            const sbClient = require('../integrations/supabase').getClient();
            const resumo = await handleLeads(sbClient, senderNum);
            await sendText(replyJid, resumo, evolutionConfigForInstance);
          } catch (e) {
            console.error('[CRM] #leads error:', e.message);
            await sendText(replyJid, '⚠️ CRM não configurado. Execute docs/crm-schema.sql no Supabase SQL Editor (Dashboard → SQL Editor → colar o conteúdo do ficheiro).', evolutionConfigForInstance);
          }
          return;
        }
        if (firstWord === '#lead' && targetRaw) {
          try {
            const sbClient = require('../integrations/supabase').getClient();
            const numNorm = extractPhoneNumber(targetRaw);
            const detalhe = await getLeadDetalhe(sbClient, numNorm || targetRaw);
            await sendText(replyJid, detalhe, evolutionConfigForInstance);
          } catch (e) {
            console.error('[CRM] #lead error:', e.message);
            await sendText(replyJid, '❌ Erro. Execute o schema SQL do CRM no Supabase.', evolutionConfigForInstance);
          }
          return;
        }

        // ── Comandos Waitlist ──
        if (firstWord === '#waitlist') {
          try {
            const sbClient = require('../integrations/supabase').getClient();
            const resumo = await handleWaitlist(sbClient, senderNum);
            await sendText(replyJid, resumo, evolutionConfigForInstance);
          } catch (e) {
            console.error('[WAITLIST] #waitlist error:', e.message);
            await sendText(replyJid, '❌ Erro ao consultar lista de espera. Execute o schema SQL (docs/stock-waitlist-schema.sql) no Supabase.', evolutionConfigForInstance);
          }
          return;
        }

        // ── Comando #repor — notificação imediata da waitlist (sem esperar cron 30 min) ──
        if (/^#repor$/i.test(firstWord)) {
          try {
            const sbClient = require('../integrations/supabase').getClient();
            await notificarClientesWaitlist(sbClient, config.stock);
            await sendText(replyJid, '✅ Clientes em fila notificados sobre reposição de stock.', evolutionConfigForInstance);
          } catch (e) {
            console.error('[STOCK-NOTIFIER] #repor error:', e.message);
            await sendText(replyJid, '❌ Erro ao notificar waitlist.', evolutionConfigForInstance);
          }
          return;
        }

        // ── Comando #renovacao — execução imediata do cron de renovação (teste manual) ──
        if (/^#renovacao$/i.test(firstWord)) {
          try {
            const sbClient = require('../integrations/supabase').getClient();
            await runDailyRenewalJob(config.stock, config.payment, sbClient, { force: true });
            await sendText(replyJid, '✅ Cron de renovação executado manualmente.', evolutionConfigForInstance);
          } catch (e) {
            console.error('[RENEWAL] #renovacao error:', e.message);
            await sendText(replyJid, '❌ Erro ao executar cron de renovação.', evolutionConfigForInstance);
          }
          return;
        }

        // ── Comando #stock / #stocks (sem args) — resumo de stock actual da Sheets ──
        if (/^#stocks?$/i.test(firstWord) && restParts.length === 0) {
          try {
            const resumo = await getStockResumo(config.stock);
            await sendText(replyJid, resumo, evolutionConfigForInstance);
          } catch (e) {
            console.error('[STOCK] #stock resumo error:', e.message);
            await sendText(replyJid, '❌ Erro ao ler stock da planilha.', evolutionConfigForInstance);
          }
          return;
        }

        // ── Comando #stock / #stocks [produto] — trigger manual de notificação waitlist ──
        if (/^#stocks?$/i.test(firstWord) && restParts.length > 0) {
          const sbClient = require('../integrations/supabase').getClient();
          const produtoStr = restParts.join(' ');
          await sendText(replyJid, `⏳ A notificar clientes em lista de espera para "${produtoStr}"...`, evolutionConfigForInstance);
          const resultado = await triggerStockReposto(sbClient, config.stock, produtoStr);
          await sendText(replyJid, resultado, evolutionConfigForInstance);
          return;
        }

        // ── Comando #expirados — lista perfis expirados ainda não renovados ──
        if (firstWord === '#expirados') {
          const expirados = await getPerfisExpirados(config.stock);
          if (expirados.length === 0) {
            await sendText(replyJid, '✅ Nenhum perfil expirado pendente.', evolutionConfigForInstance);
          } else {
            let msg = `📋 *Perfis expirados* (${expirados.length}):\n\n`;
            for (const e of expirados.slice(0, 15)) {
              const dataStr = e.dataExpiracaoRaw || 'N/D';
              msg += `• ${e.cliente || e.telefone} | ${e.platform} | ${e.email} | Exp: ${dataStr} | Status: ${e.status}\n`;
            }
            if (expirados.length > 15) msg += `\n... e mais ${expirados.length - 15}`;
            await sendText(replyJid, msg, evolutionConfigForInstance);
          }
          return;
        }

        // ── Comando #renovar [telefone] — marca renovação manual ──
        if (firstWord === '#renovar' && targetRaw) {
          const tel = extractPhoneNumber(targetRaw) || targetRaw.replace(/\D/g, '');
          const n = await renovarClientePorTelefone(config.stock, tel);
          await sendText(replyJid, n > 0 ? `✅ Renovação registada para ${tel} (${n} perfil(is)).` : `❌ Nenhum perfil activo encontrado para ${tel}.`, evolutionConfigForInstance);
          return;
        }

        // ── Comando #libertar [email] [perfil] — liberta perfil manualmente ──
        if (firstWord === '#libertar' && targetRaw) {
          const email = targetRaw;
          const perfil = restParts[1] || null;
          const lin = await findLinhaPorEmailPerfil(config.stock, email, perfil);
          if (!lin) {
            await sendText(replyJid, `❌ Perfil não encontrado para email "${email}"${perfil ? ` e perfil "${perfil}"` : ''}.`, evolutionConfigForInstance);
          } else {
            await libertarPerfil(config.stock, lin.sheetRow);
            await sendText(replyJid, `✅ Perfil libertado: ${lin.email} (linha ${lin.sheetRow}). Disponível para venda.`, evolutionConfigForInstance);
          }
          return;
        }

        const cmd = config.supervisorCommands?.[firstWord];
        const target = targetRaw ? extractPhoneNumber(targetRaw) : null;
        if (cmd) {
          if (cmd === 'pause' && target) {
            const targetSession = stateMachine.getSession(target);
            targetSession.paused = true;
            stateMachine.setState(target, 'pausado');
            await sendText(replyJid, `✅ Bot pausado para ${target}. Use #retomar ${target} para reactivar.`, evolutionConfigForInstance);
            return;
          }
          if (cmd === 'unpause' && target) {
            const targetSession = stateMachine.getSession(target);
            targetSession.paused = false;
            stateMachine.setState(target, 'menu');
            await sendText(target, config.systemMessages?.botUnpaused ?? 'O responsável já tratou do assunto. Em que mais posso ajudar?', evolutionConfigForInstance);
            await sendText(replyJid, `✅ Bot retomado para ${target}`, evolutionConfigForInstance);
          } else if (cmd === 'reset_session') {
            let count = 0;
            if (target) {
              const targetSession = stateMachine.getSession(target);
              targetSession.paused = false;
              stateMachine.setState(target, 'menu');
              await sendText(target, config.systemMessages?.botUnpaused ?? 'O responsável já tratou do assunto. Em que mais posso ajudar?', evolutionConfigForInstance);
              count = 1;
              await sendText(replyJid, `✅ Reset/despausado: ${target} (1 número)`, evolutionConfigForInstance);
            } else {
              for (const [phone, s] of stateMachine.sessions) {
                s.paused = false;
                stateMachine.setState(phone, 'menu');
                count++;
              }
              await sendText(replyJid, `✅ DESPAUSAR TODOS: ${count} número(s) libertados. A IA volta a responder a todos.`, evolutionConfigForInstance);
            }
            console.log(`[SUPERVISOR] #reset by ${senderNum}: ${count} session(s) unpaused`);
          } else if (cmd === 'status') {
            const pausedCount = [...stateMachine.sessions.values()].filter(s => s.paused).length;
            await sendText(replyJid, `📊 Sessões activas: ${stateMachine.sessions.size} | Pausadas: ${pausedCount}`, evolutionConfigForInstance);
          } else if (cmd === 'approve_sale' && target) {
            console.log(`[#sim] Recebido para número: ${target}`);
            let targetSession = stateMachine.getSession(target);
            let sessionKey = target;
            if (!targetSession.pendingSale) {
              for (const [key, s] of stateMachine.sessions) {
                if (extractPhoneNumber(key) === target && s.pendingSale) {
                  targetSession = s;
                  sessionKey = key;
                  break;
                }
              }
            }
            const pendingSale = targetSession.pendingSale;
            console.log(`[#sim] Sessão encontrada: ${pendingSale ? 'sim' : 'não'}`);
            if (pendingSale) console.log(`[#sim] PendingSale: tipo=${pendingSale.split(/\s/)[0]}, plano=${pendingSale}`);
            if (!pendingSale) {
              await sendText(replyJid, `⚠️ Não há venda pendente para este número (${target}). Verifique o número ou se o cliente já enviou o comprovativo.`, evolutionConfigForInstance);
              return;
            }
            const isRenovacao = /renova[cç][aã]o|renovar/i.test(pendingSale);
            let credentials = null;

            if (isRenovacao) {
              console.log('[#sim] Alocando renovação...');
              const n = await renovarClientePorTelefone(config.stock, target);
              if (n === 0) {
                await sendText(replyJid, `Nenhum perfil activo encontrado para ${target}. Verifique o número.`, evolutionConfigForInstance);
                return;
              }
              const perfisExistentes = await getClienteByTelefone(config.stock, target);
              const primeiro = perfisExistentes[0];
              credentials = primeiro ? { email: primeiro.email, senha: '', pin: '', perfis: [] } : null;
            } else {
              const stillHasStock = await hasStockForPendingSale(config.stock, pendingSale);
              if (!stillHasStock) {
                await sendText(replyJid, `❌ Erro: Stock esgotou. Venda cancelada para evitar duplicidade. Cliente: ${target}`, evolutionConfigForInstance);
                return;
              }
              const customerName = targetSession.name || 'Cliente';
              const mesesPagamento = targetSession.mesesPagamento || 1;
              console.log('[#sim] Alocando perfil...');
              credentials = await allocateProfile(config.stock, pendingSale, customerName, target, mesesPagamento);
              console.log(`[#sim] Perfil alocado: ${credentials ? 'sim' : 'não'}${!credentials ? ' (erro na planilha)' : ''}`);
            }

            if (!credentials || (!credentials.email && !credentials.senha)) {
              await sendText(replyJid, `❌ Erro ao alocar perfil: ${!credentials ? 'planilha ou stock indisponível.' : 'dados incompletos.'} Cliente: ${target}`, evolutionConfigForInstance);
              return;
            }
            const perfisLine = (credentials.perfis && credentials.perfis.length > 1)
              ? `\n*Perfis:* ${credentials.perfis.map((p, i) => `Perfil ${i + 1}${p.pin ? ` (PIN ${p.pin})` : ''}`).join(', ')}`
              : (credentials.pin ? `\n*PIN:* ${credentials.pin}` : '');
            const accessMsg = isRenovacao
              ? 'A sua renovação foi confirmada. O seu acesso continua activo. Qualquer dúvida, estou à disposição.'
              : `O seu acesso foi activado com sucesso. Aqui estão os seus dados:\n\n*Email:* ${credentials.email || 'Aguardando Dados'}\n*Senha:* ${credentials.senha || 'Aguardando Dados'}${perfisLine}\n\nFoi um privilégio servi-lo(a). Qualquer dúvida, estou à disposição.`;
            const targetReplyJid = targetSession.replyJid || `${target}@s.whatsapp.net`;
            await sendText(targetReplyJid, accessMsg, evolutionConfigForInstance);
            console.log('[#sim] Mensagem enviada ao cliente: sim');
            const mesesPagamento = targetSession.mesesPagamento || 1;
            targetSession.paused = false;
            targetSession.pendingSale = null;
            targetSession.mesesPagamento = null;
            targetSession.renovacaoAguardandoConfirmacao = false;
            targetSession.existingCustomerGreeted = true;
            stateMachine.setState(sessionKey, 'menu');
            const mesesInfo = mesesPagamento > 1 ? ` (${mesesPagamento} meses)` : '';
            const clienteNome = targetSession.name || target;
            await sendText(replyJid, `✅ Venda aprovada para ${clienteNome} (${target}). Dados enviados ao cliente.`, evolutionConfigForInstance);
            console.log(`[SUPERVISOR] #sim: ${isRenovacao ? 'renovação' : 'venda'} para ${target}`);
            try {
              const sbClient = require('../integrations/supabase').getClient();
              const valorMatch = (pendingSale || '').match(/(\d[\d.]*)\s*Kz/i);
              const valor = valorMatch ? parseInt(valorMatch[1].replace(/\./g, ''), 10) : 0;
              await registarCompra(sbClient, target, valor);
            } catch (_) {}
          } else if (cmd === 'reject_sale' && target) {
            const targetSession = stateMachine.getSession(target);
            const rejectMsg = 'Informamos que o departamento financeiro não conseguiu validar o seu comprovativo de pagamento. A sua reserva encontra-se suspensa. Por favor, verifique os dados da transferência e reenvie um comprovativo válido em PDF, ou contacte-nos para esclarecimentos.';
            const targetReplyJid = targetSession.replyJid || `${target}@s.whatsapp.net`;
            await sendText(targetReplyJid, rejectMsg, evolutionConfigForInstance);
            targetSession.paused = false;
            targetSession.pendingSale = null;
            stateMachine.setState(target, 'menu');
            await sendText(replyJid, `Rejeição enviada ao cliente ${target}. Sessão desbloqueada.`, evolutionConfigForInstance);
            console.log(`[SUPERVISOR] #nao: comprovativo rejeitado para ${target}`);
          }
          return;
        }
      }

      const session = stateMachine.getSession(senderNum);
      session.replyJid = replyJid;
      if (!session.name) session.name = extractName(pushName);

      // CRM: registar/actualizar lead (non-blocking)
      try {
        const sbClient = require('../integrations/supabase').getClient();
        await upsertLead(sbClient, senderNum, session.name || pushName || null);
      } catch (_) {}

      if (session.paused) {
        console.log(`[PAUSED] ${senderNum}: message ignored`);
        return;
      }

      // ── Roteamento de media: NUNCA chama a IA ──
      if (isAudio) {
        await sendText(replyJid, 'Desculpe, a Zara ainda não consegue ouvir mensagens de voz. 😅 Poderia escrever a sua dúvida, por favor? ✍️', evolutionConfigForInstance);
        return;
      }

      if (isImage) {
        if (session.pendingSale) {
          await sendText(replyJid, 'Recebi o seu comprovativo de pagamento! Vou encaminhar para o nosso supervisor validar. Assim que confirmarmos, activamos o seu perfil.', evolutionConfigForInstance);
          session.paused = true;
          stateMachine.setState(senderNum, 'pausado');
          const customerName = session.name || 'Cliente';
          const planInfo = session.pendingSale;
          for (const sup of supervisors) {
            if (sup) await sendText(sup, `COMPROVATIVO RECEBIDO (imagem)\n\nCliente: ${customerName}\nNúmero: ${senderNum}\nPlano: ${planInfo}\n\n💡 PARA ENTREGAR: #sim ${senderNum}\n🚫 PARA REJEITAR: #nao ${senderNum}`, evolutionConfigForInstance);
          }
        } else {
          await sendText(replyJid, 'Recebi a sua imagem. Em que posso ajudá-lo(a)?', evolutionConfigForInstance);
          for (const sup of supervisors) {
            if (sup) await sendText(sup, `📎 Imagem recebida de ${senderNum} (${session.name || 'Cliente'}) — sem contexto de pagamento`, evolutionConfigForInstance);
          }
        }
        return;
      }

      if (isDocument) {
        const docMsg = messageData.documentMessage || {};
        const fileName = (docMsg.fileName || '').toLowerCase();
        const mimetype = (docMsg.mimetype || '').toLowerCase();
        const isPdf = fileName.endsWith('.pdf') || mimetype === 'application/pdf';
        const isImageDoc = /\.(jpg|jpeg|png|gif|webp)$/.test(fileName) || (mimetype && mimetype.startsWith('image/'));

        if (!isPdf && !isImageDoc) {
          await sendText(replyJid, 'Aceitamos comprovativos em imagem (foto do ecrã) ou PDF. Por favor, reenvie em um desses formatos.', evolutionConfigForInstance);
          console.log(`[WEBHOOK] Documento rejeitado: fileName="${docMsg.fileName}" mimetype="${docMsg.mimetype}" de ${senderNum}`);
          return;
        }

        await sendText(replyJid, 'Recebi o seu comprovativo! Vou encaminhar para o supervisor validar. Assim que for aprovado, activamos o seu acesso.', evolutionConfigForInstance);
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        const customerName = session.name || 'Cliente';
        const planInfo = session.pendingSale || 'Aguardando Extração';
        for (const sup of supervisors) {
          if (sup) await sendText(sup, `COMPROVATIVO RECEBIDO\n\nCliente: ${customerName}\nPlano: ${planInfo}\n\n💡 PARA ENTREGAR: #sim ${senderNum}\n🚫 PARA REJEITAR: #nao ${senderNum}`, evolutionConfigForInstance);
        }
        return;
      }

      if (!textMessage.trim()) return;

      const trimmedMsg = textMessage.trim();

      // ── Rate limit: máx 2 respostas por 30s por número (excepção: "sim" / confirmação curta) ──
      const isShortConfirmation = /^(sim|s|yes|claro|quero|pode ser|bora|vamos|ok|okay|certo)$/i.test(trimmedMsg);
      if (!isShortConfirmation && !checkRateLimit(senderNum)) {
        console.log(`[RATE-LIMIT] ${senderNum}: ignorado (excedeu ${RATE_LIMIT_MAX} em ${RATE_LIMIT_WINDOW_MS / 1000}s)`);
        await new Promise((r) => setTimeout(r, 2000));
        await sendText(replyJid, 'Recebi a sua mensagem. Um momento, por favor.', evolutionConfigForInstance);
        return;
      }

      // ── Emoji sozinho: resposta curta sem LLM ──
      if (/^[\s\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(trimmedMsg) || trimmedMsg.length <= 2 && /[\u{1F300}-\u{1F9FF}]/u.test(trimmedMsg)) {
        await sendText(replyJid, 'Olá! Em que posso ajudá-lo(a)?', evolutionConfigForInstance);
        return;
      }

      // ── Waitlist: confirmação ou negação à oferta (usa session.produtoWaitlist guardado na resposta com #WAITLIST:) ──
      const confirmacoesWaitlist = /^(sim\b|s\b|ok\b|claro|pode|quero|avisa|yes\b)/i;
      const negacoesWaitlist = /^(n\b|n\s*obg|não|nao|nope|no\b|nada|deixa|cancela)/i;
      if (session?.ultimaAcao === 'perguntou_waitlist') {
        if (confirmacoesWaitlist.test(trimmedMsg)) {
          const produtoWaitlist = session.produtoWaitlist || session.platform || 'serviço';
          try {
            const sbClient = require('../integrations/supabase').getClient();
            await addToWaitlist(sbClient, senderNum, session.name || null, produtoWaitlist);
            await addProdutoInteresse(sbClient, senderNum, produtoWaitlist);
          } catch (e) {
            console.error('[WAITLIST] Erro ao adicionar na confirmação:', e.message);
          }
          await sendText(replyJid, 'Perfeito. Avisarei assim que houver vaga. Até breve.', evolutionConfigForInstance);
          session.ultimaAcao = null;
          session.produtoWaitlist = null;
          return;
        }
        if (negacoesWaitlist.test(trimmedMsg)) {
          await sendText(replyJid, 'Compreendido. Estarei à disposição sempre que precisar.', evolutionConfigForInstance);
          session.ultimaAcao = null;
          session.produtoWaitlist = null;
          return;
        }
        session.ultimaAcao = null;
        session.produtoWaitlist = null;
      }

      // ── Renovação: "Sim" após pergunta "Quer renovar?" (só quando já estamos à espera) ──
      if (session.renovacaoAguardandoConfirmacao && /^(sim|s|yes|claro|quero|pode ser|bora|vamos|ok|okay|certo)$/i.test(trimmedMsg)) {
        try {
          const perfisCliente = await getClienteByTelefone(config.stock, senderNum);
          const expirado = perfisCliente.find((p) => p.dataExpiracao && p.dataExpiracao < new Date());
          if (expirado) {
            const p = config.payment || {};
            const valorStr = (expirado.valor || '').toString().trim() || '5.000';
            const planLabel = expirado.plano || 'Individual';
            const paymentMsg = `Para renovar o seu *${expirado.platform}* *${planLabel}* — *${valorStr}* Kz.\n\n*Dados de pagamento:*\nMulticaixa Express: ${p.multicaixa || 'N/A'}\nIBAN: ${p.iban || 'N/A'}\nTitular: ${p.titular || 'N/A'}\n\nApós o pagamento, envie o comprovativo (foto do ecrã ou PDF).`;
            await sendText(replyJid, paymentMsg, evolutionConfigForInstance);
            session.pendingSale = `${expirado.platform} ${planLabel} - Renovação - ${valorStr} Kz`;
            session.renovacaoAguardandoConfirmacao = false;
            session.platform = expirado.platform;
            session.plan = planLabel;
            for (const sup of supervisors) {
              if (sup) await sendText(sup, `🔄 RENOVAÇÃO: ${session.name || 'Cliente'} (${senderNum}) quer renovar ${expirado.platform} ${planLabel} — ${valorStr} Kz`, evolutionConfigForInstance);
            }
            console.log(`[RENOVACAO] ${senderNum}: confirmou renovação, dados enviados`);
            return;
          }
        } catch (e) {
          console.error('[WEBHOOK] renovação:', e.message);
        }
        session.renovacaoAguardandoConfirmacao = false;
      }

      // ── Cliente existente (planilha): APENAS na primeira mensagem da sessão; não interceptar se já tem sessão activa ou keywords de intenção ──
      const hasIntentKeyword = (txt) => {
        const t = normalizeText(txt || '');
        return /\b(cancelar|desistir|parar|encerrar|n[aã]o\s*quero\s*mais)\b/.test(t) ||
          /\b(renovar|renov|continuar|manter|prolongar|quero\s*renovar)\b/.test(t) ||
          /\b(reclam|erro|problema|n[aã]o\s*funciona|senha\s*errada|bloquead)\b/.test(t) ||
          /\b(ajuda|humano|falar\s*com|respons[aá]vel|supervisor)\b/.test(t) ||
          /\b(localiza[cç][aã]o|household|agregado|tv\s*n[aã]o\s*faz\s*parte)\b/.test(t);
      };

      try {
        const perfisCliente = await getClienteByTelefone(config.stock, senderNum);
        const isFirstMessage = !session.existingCustomerGreeted && ( !session.history || session.history.length === 0 );
        const inRenovationState = session.renovacaoAguardandoConfirmacao;

        if (perfisCliente.length > 0 && !inRenovationState) {
          if (hasIntentKeyword(textMessage)) {
            // Não interceptar: deixar passar para handlers de cancelamento, renovação, reclamação ou humano
          } else if (isFirstMessage) {
            const nomeCliente = session.name || perfisCliente[0].cliente || 'Cliente';
            const aVerificar = perfisCliente.find((p) => p.status === 'a_verificar');
            if (aVerificar) {
              await sendText(replyJid, `Olá ${nomeCliente}! Vi que tem uma renovação pendente. Quer continuar com a conta *${aVerificar.platform}*?`, evolutionConfigForInstance);
              session.existingCustomerGreeted = true;
              return;
            }
            const activos = perfisCliente.filter((p) => p.status === 'indisponivel' || p.status === 'vendido');
            if (activos.length > 0) {
              const hoje = new Date();
              hoje.setHours(0, 0, 0, 0);
              const em7 = new Date(hoje);
              em7.setDate(em7.getDate() + 7);
              const primeiro = activos[0];
              const dataExp = primeiro.dataExpiracao;
              const dataStr = primeiro.dataExpiracaoRaw || (dataExp ? dataExp.toLocaleDateString('pt-PT') : 'N/D');
              if (dataExp && dataExp >= em7) {
                await sendText(replyJid, `Olá ${nomeCliente}! Vi que já tem uma conta *${primeiro.platform}* activa até *${dataStr}*. Em que posso ajudá-lo(a)?`, evolutionConfigForInstance);
                session.existingCustomerGreeted = true;
                return;
              }
              if (dataExp && dataExp >= hoje && dataExp < em7) {
                await sendText(replyJid, `Olá ${nomeCliente}! A sua conta *${primeiro.platform}* expira em breve (*${dataStr}*). Quer renovar?`, evolutionConfigForInstance);
                session.existingCustomerGreeted = true;
                return;
              }
              if (dataExp && dataExp < hoje) {
                await sendText(replyJid, `Olá ${nomeCliente}! A sua conta *${primeiro.platform}* expirou no dia *${dataStr}*. Quer renovar?`, evolutionConfigForInstance);
                session.existingCustomerGreeted = true;
                session.renovacaoAguardandoConfirmacao = true;
                return;
              }
              await sendText(replyJid, `Olá ${nomeCliente}! Vi que já tem conta(s) connosco. Em que posso ajudá-lo(a)?`, evolutionConfigForInstance);
              session.existingCustomerGreeted = true;
              return;
            }
          }
          // Já cumprimentado ou não primeira mensagem: não interceptar, seguir para LLM
        }
      } catch (err) {
        console.error('[WEBHOOK] getClienteByTelefone:', err.message);
      }

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

      if (isHumanRequest && !session.paused && !isSup) {
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
            evolutionConfigForInstance);
        }
        await sendText(replyJid,
          'Compreendo. Vou chamar o responsável para ' +
          'o(a) ajudar directamente. Por favor, aguarde.',
          evolutionConfigForInstance);
        return;
      }

      // ── Interceptor: Erro de localização/Household Netflix — auto-ajuda (NÃO escalar) ──
      if (detectarLocalizacao(textMessage) && !session.paused && !isSup) {
        if (session.locationHelpSent) {
          session.paused = true;
          stateMachine.setState(senderNum, 'pausado');
          const clientName = session.name || 'Cliente';
          await sendText(
            replyJid,
            `Compreendo, ${clientName}. Como os passos anteriores não resolveram, vou chamar o responsável técnico para ajudar directamente. Por favor, aguarde.`,
            evolutionConfigForInstance
          );
          for (const sup of supervisors) {
            if (sup) {
              await sendText(
                sup,
                formatarNotificacaoReclamacao(clientName, senderNum, session.platform || 'Netflix', `Erro de localização/Household PERSISTENTE (cliente já recebeu instruções): "${textMessage.substring(0, 200)}"`),
                evolutionConfigForInstance
              );
            }
          }
          console.log(`[LOCALIZACAO-PERSISTENTE] ${senderNum}: escalado ao supervisor`);
        } else {
          const clientName = session.name || 'Cliente';
          await sendText(replyJid, gerarRespostaLocalizacao(clientName), evolutionConfigForInstance);
          session.locationHelpSent = true;
          session.platform = session.platform || 'Netflix';
          console.log(`[LOCALIZACAO] ${senderNum}: instruções de auto-ajuda enviadas`);
          for (const sup of supervisors) {
            if (sup) {
              await sendText(sup, `📍 Erro localização/Household — ${clientName} (${senderNum}). Instruções de auto-ajuda enviadas.`, evolutionConfigForInstance);
            }
          }
        }
        return;
      }

      // ── Interceptor: Reclamação técnica grave (ANTES do LLM) — escalar ao supervisor ──
      if (detectarReclamacao(textMessage) && !session.paused && !isSup) {
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        const clientName = session.name || 'Cliente';
        const plataformaSessao = session.platform || '';
        await sendText(
          replyJid,
          `Lamento imenso o transtorno, ${clientName}. Já estou a encaminhar ao nosso responsável técnico para resolver com a máxima brevidade. Por favor, aguarde um momento.`,
          evolutionConfigForInstance
        );
        for (const sup of supervisors) {
          if (sup) {
            await sendText(
              sup,
              formatarNotificacaoReclamacao(clientName, senderNum, plataformaSessao, textMessage),
              evolutionConfigForInstance
            );
          }
        }
        console.log(`[RECLAMACAO] ${senderNum}: "${textMessage.substring(0, 80)}"`);
        return;
      }

      // ── Interceptor: Lacuna 10 — Cancelamento (keywords fortes) ──
      const cancelPatterns = [
        /\b(quero\s*(cancelar|desistir|parar|encerrar)|n[aã]o\s*quero\s*mais|cancela\s*(a\s*minha|o\s*meu))\b/i,
        /\b(cancelamento|encerrar\s*(a\s*minha|o\s*meu|a\s*conta))\b/i,
      ];
      const isCancelRequest = cancelPatterns.some((p) => p.test(textMessage));
      if (isCancelRequest && !session.paused && !isSup) {
        const clientName = session.name || 'Cliente';
        const plataformaSessao = session.platform || session.pendingSale?.split(' ')[0] || 'serviço';
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        await sendText(
          replyJid,
          `Lamento ouvir isso, ${clientName}. 😔 Vou passar ao responsável para processar o seu pedido. Obrigado pela confiança que depositou em nós.`,
          evolutionConfigForInstance
        );
        for (const sup of supervisors) {
          if (sup) {
            await sendText(
              sup,
              `🚫 *PEDIDO DE CANCELAMENTO*\n\n*Cliente:* ${clientName}\n*Número:* ${senderNum}\n*Serviço:* ${plataformaSessao}\n\n💡 Para reactivar o bot: #retomar ${senderNum}`,
              evolutionConfigForInstance
            );
          }
        }
        console.log(`[CANCELAMENTO] ${senderNum}: "${textMessage.substring(0, 80)}"`);
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // Pipeline LLM-First: A → B → C → D
      // ═══════════════════════════════════════════════════════════════

      // Contexto cliente existente (para LLM): quando já foi cumprimentado e vai para o LLM
      try {
        const perfisParaContexto = await getClienteByTelefone(config.stock, senderNum);
        if (perfisParaContexto.length > 0 && session.existingCustomerGreeted) {
          const p = perfisParaContexto[0];
          const dataStr = p.dataExpiracaoRaw || (p.dataExpiracao ? p.dataExpiracao.toLocaleDateString('pt-PT') : 'N/D');
          session.existingCustomerContext = `Este cliente já tem ${p.platform} ${p.plano || 'plano'} activo até ${dataStr}. A última mensagem dele foi: "${textMessage.substring(0, 200)}". Responde de acordo com a intenção dele (cancelar, renovar, dúvida, etc.), sem repetir a mensagem de reconhecimento.`;
        } else {
          session.existingCustomerContext = '';
        }
      } catch (_) {
        session.existingCustomerContext = '';
      }

      // Passo A: Inventário atualizado + contagens de stock para verificação pré-pagamento (CPA)
      const inventoryString = await getInventoryFn();
      const stockCountsResult = await getStockCountsForPrompt(config.stock);

      // Passo A+: Reconhecimento de cliente existente (Sheets primeiro, Supabase como fallback)
      let diasRestantes = null;
      let customerName = null;
      let isReturningCustomer = false;

      // 1) Sheets + leads (CRM) — usa checkClienteExistente
      try {
        const infoExistente = await checkClienteExistente(config.stock, senderNum);
        if (infoExistente && infoExistente.existente) {
          isReturningCustomer = true;
          if (infoExistente.dataExpiracao instanceof Date && !isNaN(infoExistente.dataExpiracao)) {
            diasRestantes = Math.ceil(
              (infoExistente.dataExpiracao.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
          }
        }
      } catch (crmErr) {
        console.error('[CRM] checkClienteExistente error:', crmErr.message);
      }

      // 2) Supabase (clientes + vendas) — enriquece com nome e data_expiracao mais recente
      customerName = null;
      let lastSale = null;
      try {
        ({ customerName, isReturningCustomer, lastSale } = await getClientByPhone(senderNum));
      } catch (sbErr) {
        console.error('[SUPABASE] Falha ao consultar cliente:', sbErr.message);
      }
      console.log(
        `[CRM] ${senderNum} → cliente: ${customerName || 'NOVO'} | retornante: ${isReturningCustomer}`
      );

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
        let plataformaNorm = (session.platform || session.pendingSale || '').toLowerCase().trim();
        if (plataformaNorm.includes('prime')) plataformaNorm = 'Prime Video';
        if (plataformaNorm.includes('netflix')) plataformaNorm = 'Netflix';
        if (plataformaNorm) {
          session.platform = plataformaNorm;
        }
        finalResponse = finalResponse.replace(new RegExp(`${metaTag}\\s*:[^\\n]*`, 'gi'), '').trim().replace(/\n{2,}/g, '\n');
        console.log(`[CPA] pendingSale guardado para ${senderNum}:`, session.pendingSale);
        // CRM: marcar como interessado quando há pendingSale
        try {
          const sbClient = require('../integrations/supabase').getClient();
          const produtoInteresse = session.platform || session.pendingSale?.split(' ')[0] || '';
          if (produtoInteresse) await addProdutoInteresse(sbClient, senderNum, produtoInteresse);
        } catch (_) {}
      }

      // Detectar tag #WAITLIST (LLM ofereceu lista de espera — guardar produto e estado; adição à fila só na confirmação do cliente)
      const waitlistMatch = finalResponse.match(/#WAITLIST:\s*([^\n]+)/i);
      if (waitlistMatch) {
        const produtoWaitlist = waitlistMatch[1].trim();
        session.ultimaAcao = 'perguntou_waitlist';
        session.produtoWaitlist = produtoWaitlist;
        finalResponse = finalResponse.replace(/#WAITLIST:\s*[^\n]*/gi, '').trim().replace(/\n{2,}/g, '\n');
        console.log(`[WAITLIST] Oferta registada para ${senderNum} — produto: "${produtoWaitlist}" (adição à fila na confirmação do cliente)`);
      }

      // ── Lacuna 4 (backup LLM): tag #RECLAMACAO — pausa + notifica supervisor ──
      const reclamacaoMatch = finalResponse.match(/#RECLAMACAO:\s*([^\n]+)/i);
      if (reclamacaoMatch && !session.paused) {
        const descricao = reclamacaoMatch[1].trim();
        finalResponse = finalResponse.replace(/#RECLAMACAO:\s*[^\n]*/gi, '').trim().replace(/\n{2,}/g, '\n');
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        for (const sup of supervisors) {
          if (sup) {
            await sendText(
              sup,
              formatarNotificacaoReclamacao(session.name || senderNum, senderNum, session.platform || '', descricao),
              evolutionConfigForInstance
            );
          }
        }
        console.log(`[RECLAMACAO-LLM] ${senderNum}: "${descricao}"`);
      }

      // ── Lacuna 10 (backup LLM): tag #CANCELAMENTO — pausa + notifica supervisor ──
      const cancelamentoMatch = finalResponse.match(/#CANCELAMENTO:\s*([^\n]*)/i);
      if (cancelamentoMatch && !session.paused) {
        const infoCancelamento = cancelamentoMatch[1].trim() || session.platform || 'serviço';
        finalResponse = finalResponse.replace(/#CANCELAMENTO:\s*[^\n]*/gi, '').trim().replace(/\n{2,}/g, '\n');
        session.paused = true;
        stateMachine.setState(senderNum, 'pausado');
        for (const sup of supervisors) {
          if (sup) {
            await sendText(
              sup,
              `🚫 *CANCELAMENTO (confirmado pelo cliente)*\n\n*Cliente:* ${session.name || senderNum}\n*Número:* ${senderNum}\n*Serviço:* ${infoCancelamento}\n\n💡 Para reactivar o bot: #retomar ${senderNum}`,
              evolutionConfigForInstance
            );
          }
        }
        console.log(`[CANCELAMENTO-LLM] ${senderNum}: "${infoCancelamento}"`);
      }

      // ── Lacuna 6: tag #INDICACAO — registar referência ──
      const indicacaoMatch = finalResponse.match(/#INDICACAO:\s*([^\n]+)/i);
      if (indicacaoMatch) {
        const raw = indicacaoMatch[1].trim();
        finalResponse = finalResponse.replace(/#INDICACAO:\s*[^\n]*/gi, '').trim().replace(/\n{2,}/g, '\n');
        const indicacaoParts = raw.split(/\s+/);
        const numeroIndicado = (indicacaoParts.find((p) => /^\d{7,}$/.test(p.replace(/\D/g, ''))) || '').replace(/\D/g, '');
        const nomeIndicado = indicacaoParts.filter((p) => !/^\d/.test(p)).join(' ') || 'desconhecido';
        console.log(`[INDICACAO] ${senderNum} indicou: ${nomeIndicado} (${numeroIndicado})`);
        for (const sup of supervisors) {
          if (sup) {
            await sendText(
              sup,
              `🤝 *NOVA INDICAÇÃO*\n\n*Indicador:* ${session.name || senderNum} (${senderNum})\n*Indicado:* ${nomeIndicado}\n*Número:* ${numeroIndicado || 'não fornecido'}\n\nConsidere contactar o indicado.`,
              evolutionConfigForInstance
            );
          }
        }
      }

      // ── Lacuna 3: tag #MESES — pagamento antecipado (guardar na sessão) ──
      const mesesMatch = finalResponse.match(/#MESES:\s*(\d+)/i);
      if (mesesMatch) {
        session.mesesPagamento = parseInt(mesesMatch[1], 10) || 1;
        finalResponse = finalResponse.replace(/#MESES:\s*\d+/gi, '').trim().replace(/\n{2,}/g, '\n');
        console.log(`[PAGAMENTO-ANTECIPADO] ${senderNum}: ${session.mesesPagamento} meses`);
      }

      // Strip centralizado de tags internas — só envia se sobrar texto visível
      const textoLimpo = finalResponse
        .replace(new RegExp(`${metaTag}\\s*:[^\\n]*`, 'gi'), '')
        .replace(/#WAITLIST:[^\n]*/gi, '')
        .replace(/#RESUMO_VENDA:[^\n]*/gi, '')
        .replace(/#RECLAMACAO:[^\n]*/gi, '')
        .replace(/#CANCELAMENTO:[^\n]*/gi, '')
        .replace(/#INDICACAO:[^\n]*/gi, '')
        .replace(/#MESES:[^\n]*/gi, '')
        .replace(/\n{2,}/g, '\n')
        .trim();

      if (textoLimpo) {
        await sendText(replyJid, textoLimpo, evolutionConfigForInstance);
      }

      stateMachine.addToHistory(senderNum, 'user', textMessage);
      stateMachine.addToHistory(senderNum, 'model', textoLimpo || finalResponse);

    } catch (err) {
      console.error('[WEBHOOK FATAL ERROR]', err);
      try {
        if (!res.headersSent) res.status(500).send('Erro interno');
      } catch (sendErr) {
        console.error('[WEBHOOK] send 500 fail', sendErr && sendErr.message);
      }
    }
  };
}

module.exports = { createWebhookHandler };
