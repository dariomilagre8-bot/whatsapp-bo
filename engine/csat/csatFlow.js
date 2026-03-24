'use strict';

const { updateCsatByTraceId } = require('../lib/paKpiInsert');

const QUESTION = 'De 1 a 5, como avalia o atendimento? (Responda apenas o número)';
const DELAY_MS = 120000;

function bumpInboundCancelCsatSchedule(session) {
  if (session._csatSendTimer) {
    clearTimeout(session._csatSendTimer);
    session._csatSendTimer = null;
  }
}

function parseCsatDigit(text) {
  const t = String(text || '').trim();
  if (/^[1-5]$/.test(t)) return parseInt(t, 10);
  return null;
}

function scheduleCsatIfResolved({
  session,
  sendClient,
  replyJid,
  traceId,
  clientId,
}) {
  if (process.env.CSAT_ENABLED !== 'true' || !sendClient || !replyJid) return;
  bumpInboundCancelCsatSchedule(session);
  const tid = traceId || `${clientId || 'x'}:${Date.now()}`;
  session._csatSendTimer = setTimeout(() => {
    session._csatSendTimer = null;
    session.csatAwaiting = true;
    session.csatTraceId = tid;
    sendClient(replyJid, QUESTION).catch(() => {});
  }, DELAY_MS);
}

/**
 * @returns {Promise<boolean>} true se consumiu a mensagem (só score)
 */
async function tryConsumeCsatReply({ session, textMessage, clientId }) {
  if (!session.csatAwaiting) return false;
  const score = parseCsatDigit(textMessage);
  session.csatAwaiting = false;
  if (score != null) {
    await updateCsatByTraceId(session.csatTraceId, score);
    session.csatTraceId = null;
    return true;
  }
  session.csatTraceId = null;
  return false;
}

module.exports = {
  QUESTION,
  DELAY_MS,
  parseCsatDigit,
  bumpInboundCancelCsatSchedule,
  scheduleCsatIfResolved,
  tryConsumeCsatReply,
};
