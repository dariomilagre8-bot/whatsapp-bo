// engine/middleware/health.js — GET /api/health (Supabase, Redis, Evolution, Sheets)

/**
 * Cria o handler de health check.
 * @param {Object} deps - { getSupabaseClient, getSheetsReady, getEvolutionState, getRedis, clientsCount }
 */
function createHealthCheck(deps) {
  return async function healthCheck(req, res) {
    const start = Date.now();
    const checks = {};
    const evoInstance = deps.evolutionInstance || process.env.EVOLUTION_INSTANCE || 'default';

    // Supabase
    try {
      const t0 = Date.now();
      const sb = deps.getSupabaseClient && deps.getSupabaseClient();
      if (sb) {
        const { error } = await sb.from('clientes').select('id').limit(1);
        checks.supabase = { status: error ? 'fail' : 'ok', latencyMs: Date.now() - t0 };
        if (error) checks.supabase.error = error.message;
      } else {
        checks.supabase = { status: 'fail', latencyMs: 0, error: 'not_configured' };
      }
    } catch (e) {
      checks.supabase = { status: 'fail', latencyMs: 0, error: e.message };
    }

    // Redis (opcional)
    try {
      const t0 = Date.now();
      const redis = deps.getRedis && deps.getRedis();
      if (redis) {
        await redis.ping();
        checks.redis = { status: 'ok', latencyMs: Date.now() - t0 };
      } else {
        checks.redis = { status: 'ok', latencyMs: 0, note: 'not_configured' };
      }
    } catch (e) {
      checks.redis = { status: 'fail', latencyMs: 0, error: e.message };
    }

    // Evolution API
    try {
      const t0 = Date.now();
      const evoUrl = process.env.EVOLUTION_API_URL;
      const evoKey = process.env.EVOLUTION_API_KEY;
      if (evoUrl) {
        const resp = await fetch(`${evoUrl}/instance/connectionState/${evoInstance}`, {
          headers: { apikey: evoKey },
          signal: AbortSignal.timeout(5000),
        });
        const data = await resp.json();
        const state = data?.instance?.state || data?.state;
        checks.evolution_api = { status: state === 'open' ? 'ok' : 'fail', latencyMs: Date.now() - t0 };
        if (state !== 'open') checks.evolution_api.error = `state: ${state}`;
      } else {
        checks.evolution_api = { status: 'fail', latencyMs: 0, error: 'not_configured' };
      }
    } catch (e) {
      checks.evolution_api = { status: 'fail', latencyMs: 0, error: e.message };
    }

    // Google Sheets
    try {
      const t0 = Date.now();
      const ready = deps.getSheetsReady && deps.getSheetsReady();
      checks.google_sheets = { status: ready ? 'ok' : 'fail', latencyMs: Date.now() - t0 };
      if (!ready) checks.google_sheets.error = 'not_initialized';
    } catch (e) {
      checks.google_sheets = { status: 'fail', latencyMs: 0, error: e.message };
    }

    const critical = ['supabase', 'evolution_api'];
    const hasFail = critical.some(k => checks[k] && checks[k].status === 'fail');
    const status = hasFail ? 'down' : (Object.values(checks).some(c => c.status === 'fail') ? 'degraded' : 'ok');

    res.status(status === 'down' ? 503 : 200).json({
      status,
      checks,
      clients: deps.clientsCount != null ? deps.clientsCount : 1,
      uptime: Math.floor(process.uptime()),
      response_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  };
}

module.exports = { createHealthCheck };
