// engine/outreach/followUpSequence.js — follow-ups dia 2 / dia 7 / dead (sem envio automático)

const DAY2 =
  'Hey {nome_pessoa}, enviei uma mensagem há 2 dias sobre o WhatsApp da {nome_empresa}. Sei que é ocupado/a — posso enviar um vídeo de 90 segundos que mostra tudo?';

const DAY7 =
  '{nome_pessoa}, última mensagem sobre isto. Se não for o momento certo, sem stress. Se quiser ver como funciona no futuro, responda \'sim\' e guardo o vosso contacto.';

const { fillPlaceholders } = require('./messageTemplates');

/**
 * @param {string|null} leadId — reservado para logs / correlação (opcional)
 * @param {number} daysSinceSent — dias inteiros desde sent_at da mensagem inicial
 * @param {object} [vars] — { nome_pessoa, nome_empresa }
 */
function getFollowUp(leadId, daysSinceSent, vars = {}) {
  const d = Number(daysSinceSent);
  if (!Number.isFinite(d) || d < 0) {
    return { leadId: leadId || null, phase: 'wait', message: null, suggestedStatus: null };
  }
  if (d < 2) {
    return { leadId: leadId || null, phase: 'wait', message: null, suggestedStatus: null };
  }
  if (d > 7) {
    return { leadId: leadId || null, phase: 'dead', message: null, suggestedStatus: 'dead' };
  }
  if (d === 7) {
    return {
      leadId: leadId || null,
      phase: 'followup_2',
      message: fillPlaceholders(DAY7, vars),
      suggestedStatus: null,
    };
  }
  return {
    leadId: leadId || null,
    phase: 'followup_1',
    message: fillPlaceholders(DAY2, vars),
    suggestedStatus: null,
  };
}

module.exports = { getFollowUp, DAY2, DAY7 };
