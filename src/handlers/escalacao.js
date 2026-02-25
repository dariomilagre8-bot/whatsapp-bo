// ESCALATION_PATTERN + HUMAN_TRANSFER + LOCATION_ISSUE — pausa bot e notifica supervisor
const config = require('../config');
const { HUMAN_TRANSFER_PATTERN, ESCALATION_PATTERN, LOCATION_ISSUE_PATTERN, BOT_NAME, removeAccents } = config;

/**
 * Pedido de atendimento humano (#humano, etc.). Pausa o bot e notifica o supervisor.
 * @returns {Promise<boolean>} true se tratou (cliente pediu humano)
 */
async function handleHumanTransfer(deps, senderNum, state, textMessage) {
  const { pausedClients, markDirty, sendWhatsAppMessage, MAIN_BOSS, checkClientInSheet } = deps;
  if (!textMessage || pausedClients[senderNum] || state.step === 'esperando_supervisor') return false;
  if (!HUMAN_TRANSFER_PATTERN.test(removeAccents(textMessage.toLowerCase()))) return false;

  pausedClients[senderNum] = true;
  markDirty(senderNum);
  const nome = state.clientName;
  await sendWhatsAppMessage(senderNum, `Claro${nome ? ', ' + nome : ''}! 😊 Vou transferir-te para a nossa equipa. Um supervisor irá falar contigo em breve.`);
  if (MAIN_BOSS) {
    let planInfo = '';
    try {
      const existing = await checkClientInSheet(senderNum);
      if (existing) planInfo = `\n📦 Plano na base: *${existing.plataforma}* (${existing.tipoConta || 'N/A'})`;
    } catch (_) {}
    const branding = deps.branding || require('../../branding');
    await sendWhatsAppMessage(MAIN_BOSS,
      `🙋 *PEDIDO DE ATENDIMENTO HUMANO*\n👤 ${senderNum}${nome ? ' (' + nome + ')' : ''}${planInfo}\n📍 Step: ${state.step}\n💬 "${(textMessage || '').substring(0, 150)}"\n\nBot pausado. Use *retomar ${senderNum}* quando terminar.`
    );
  }
  return true;
}

/**
 * Escalação automática (email, senha, problemas). Pausa o bot e avisa o supervisor.
 * @returns {Promise<boolean>} true se tratou
 */
async function handleEscalacao(deps, senderNum, state, textMessage, pushName) {
  const { pausedClients, markDirty, sendWhatsAppMessage, MAIN_BOSS, checkClientInSheet } = deps;
  if (!textMessage || pausedClients[senderNum] || state.step === 'esperando_supervisor') return false;
  if (!ESCALATION_PATTERN.test(removeAccents(textMessage.toLowerCase()))) return false;

  pausedClients[senderNum] = true;
  markDirty(senderNum);
  const nome = state.clientName || pushName || '';
  const branding = deps.branding || require('../../branding');
  await sendWhatsAppMessage(senderNum,
    `${nome ? nome + ', o' : 'O'} teu pedido foi recebido! 🙏\nUm membro da nossa equipa irá contactar-te em breve para resolver a situação.\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`
  );
  if (MAIN_BOSS) {
    let planInfo = '';
    try {
      const existing = await checkClientInSheet(senderNum);
      if (existing) planInfo = `\n📦 Plano na base: *${existing.plataforma}* (${existing.tipoConta || 'N/A'})`;
    } catch (_) {}
    await sendWhatsAppMessage(MAIN_BOSS,
      `🔔 *ESCALAÇÃO AUTOMÁTICA*\n👤 ${senderNum}${nome ? ' (' + nome + ')' : ''}${planInfo}\n📍 Step: ${state.step}\n💬 "${textMessage.substring(0, 200)}"\n\n⚠️ Bot pausado. Use *retomar ${senderNum}* quando terminar.`
    );
  }
  return true;
}

/**
 * Problema de localização Netflix. Responde com guia; não pausa.
 * @returns {Promise<boolean>} true se tratou
 */
async function handleLocationIssue(deps, senderNum, state, textMessage) {
  const { sendWhatsAppMessage, MAIN_BOSS } = deps;
  if (!textMessage || !LOCATION_ISSUE_PATTERN.test(removeAccents(textMessage.toLowerCase()))) return false;

  const nome = state.clientName;
  await sendWhatsAppMessage(senderNum,
    `Olá${nome ? ' ' + nome : ''}! 😊 Recebi a tua mensagem sobre localização.\n\n` +
    `*O que deves fazer:*\n` +
    `1️⃣ Abre o Netflix no teu dispositivo\n` +
    `2️⃣ Vai a *Conta → Gerir acesso e dispositivos*\n` +
    `3️⃣ Confirma a tua localização principal\n\n` +
    `Se não conseguires resolver em 5 minutos, responde aqui e o nosso supervisor ajuda! 🙏`
  );
  if (MAIN_BOSS) {
    await sendWhatsAppMessage(MAIN_BOSS, `📍 *ERRO LOCALIZAÇÃO NETFLIX*\n👤 ${senderNum}${nome ? ' (' + nome + ')' : ''}\n💬 "${textMessage.substring(0, 80)}"\n\nUse *localizacao ${senderNum}* se precisar de intervir manualmente.`);
  }
  return true;
}

module.exports = { handleEscalacao, handleHumanTransfer, handleLocationIssue };
