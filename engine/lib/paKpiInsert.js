'use strict';

/**
 * INSERT não bloqueante em pa_daily_insights (linha por mensagem / evento).
 */
function insertPaKpiRow(row) {
  try {
    const sb = require('../../src/integrations/supabase').getClient();
    if (!sb) return;
    const payload = { ...row };
    if (payload.client_id && !payload.client_slug) payload.client_slug = payload.client_id;
    sb.from('pa_daily_insights').insert(payload).then(() => {}).catch((err) => {
      console.error('[KPI] insert falhou:', err.message);
    });
  } catch (e) {
    console.error('[KPI] insert excepção:', e.message);
  }
}

function updateCsatByTraceId(traceId, score) {
  if (!traceId) return Promise.resolve();
  try {
    const sb = require('../../src/integrations/supabase').getClient();
    if (!sb) return Promise.resolve();
    return sb.from('pa_daily_insights')
      .update({ csat_score: score })
      .eq('trace_id', traceId)
      .then(() => {})
      .catch((err) => console.error('[CSAT] update falhou:', err.message));
  } catch (e) {
    return Promise.resolve();
  }
}

module.exports = { insertPaKpiRow, updateCsatByTraceId };
