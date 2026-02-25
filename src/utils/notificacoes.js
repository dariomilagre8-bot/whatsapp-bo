// Vendas perdidas + sweeps (aguardando_reposicao 2h, inactivos 2h)
const { appendLostSale } = require('../../googleSheets');

const lostSales = [];
let lostSaleCounter = 1;

let sendWhatsAppMessageFn = null;
let MAIN_BOSS_VAR = null;
let cleanupSessionFn = null;
let clientStatesRef = null;
let pendingVerificationsRef = null;

function init(deps) {
  sendWhatsAppMessageFn = deps.sendWhatsAppMessage;
  MAIN_BOSS_VAR = deps.MAIN_BOSS;
  cleanupSessionFn = deps.cleanupSession;
  clientStatesRef = deps.clientStates;
  pendingVerificationsRef = deps.pendingVerifications;
}

function logLostSale(phone, clientName, interests, lastState, reason) {
  const sale = {
    id: lostSaleCounter++,
    phone,
    clientName: clientName || '',
    interests: interests || [],
    lastState: lastState || '',
    reason,
    timestamp: Date.now(),
    recovered: false
  };
  lostSales.push(sale);

  if (MAIN_BOSS_VAR && sendWhatsAppMessageFn) {
    const interestStr = sale.interests.length > 0 ? sale.interests.join(', ') : 'N/A';
    sendWhatsAppMessageFn(MAIN_BOSS_VAR, `📉 *VENDA PERDIDA #${sale.id}*\n👤 ${sale.phone}${sale.clientName ? ' (' + sale.clientName + ')' : ''}\n📦 Interesse: ${interestStr}\n❌ Motivo: ${reason}\n\nUse *recuperar ${sale.id} <mensagem>* para re-contactar.`);
  }

  appendLostSale(sale).catch(e => console.error('Erro ao salvar venda perdida:', e.message));
  return sale;
}

function startSweeps() {
  // Sweep aguardando_reposicao — 30min follow-up + 2h timeout final
  setInterval(async () => {
    const now = Date.now();
    const THIRTY_MIN = 30 * 60 * 1000;
    const TWO_HOURS_RECOVERY = 2 * 60 * 60 * 1000;
    const clientStates = clientStatesRef || {};
    for (const [num, state] of Object.entries(clientStates)) {
      if (state.step !== 'aguardando_reposicao' && state.step !== 'aguardando_resposta_alternativa') continue;
      const recovery = state.pendingRecovery;
      if (!recovery) continue;
      const elapsed = now - recovery.timestamp;

      if (elapsed >= THIRTY_MIN && !state.recovery30minSent) {
        state.recovery30minSent = true;
        const pedidoDesc = `${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.plan}`;
        await sendWhatsAppMessageFn(num, `Ainda estamos a verificar a disponibilidade para o teu pedido de ${pedidoDesc}. Entretanto, posso ajudar-te com outra coisa?`);
      }

      if (elapsed >= TWO_HOURS_RECOVERY) {
        const nome = state.clientName;
        await sendWhatsAppMessageFn(num, `${nome ? nome + ', p' : 'P'}edimos desculpa pela demora. Infelizmente não conseguimos repor o stock a tempo para o teu pedido.\n\nComo compensação, terás *prioridade* na próxima reposição! Vamos notificar-te assim que houver disponibilidade. 😊\n\nSe precisares de algo entretanto, estamos aqui.`);
        logLostSale(num, nome, state.interestStack || [], state.step, `Timeout reposição (2h): ${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.service} ${recovery.plan}`);
        if (MAIN_BOSS_VAR) {
          await sendWhatsAppMessageFn(MAIN_BOSS_VAR, `⏰ *TIMEOUT 2H* — Stock não reposto\n👤 ${num} (${nome || ''})\n📦 ${recovery.qty > 1 ? recovery.qty + 'x ' : ''}${recovery.service} ${recovery.plan}\nSessão limpa automaticamente.`);
        }
        cleanupSessionFn(num);
      }
    }
  }, 5 * 60 * 1000);

  // Sweep: clientes inativos há 2+ horas
  setInterval(() => {
    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const clientStates = clientStatesRef || {};
    const pendingVerifications = pendingVerificationsRef || {};
    for (const [num, state] of Object.entries(clientStates)) {
      if (state.lastActivity && (now - state.lastActivity) > TWO_HOURS) {
        if (state.step !== 'inicio' && state.step !== 'esperando_supervisor' && state.step !== 'aguardando_reposicao' && state.step !== 'aguardando_resposta_alternativa' && !pendingVerifications[num]) {
          logLostSale(num, state.clientName, state.interestStack || [], state.step, 'Timeout (2h sem atividade)');
          cleanupSessionFn(num);
        }
      }
    }
  }, 30 * 60 * 1000);
}

function getLostSales() {
  return lostSales;
}

module.exports = {
  init,
  logLostSale,
  getLostSales,
  lostSales,
  startSweeps,
};
