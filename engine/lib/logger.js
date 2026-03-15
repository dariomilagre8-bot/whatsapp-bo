// engine/lib/logger.js — Logs JSON com trace_id por mensagem (LOG_LEVEL do .env)

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log(level, message, meta = {}) {
  if (LEVELS[level] < CURRENT_LEVEL) return;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.log(line);
}

/**
 * Logger com contexto de trace (cada mensagem processada tem trace_id).
 * @param {string} [traceId] - UUID da mensagem
 * @param {string} [clientSlug] - Slug do cliente
 * @param {string} [module] - Módulo (ex: webhook)
 */
function createLogger(traceId, clientSlug, module = 'app') {
  const baseMeta = { traceId: traceId || null, clientSlug: clientSlug || null };
  return {
    debug: (msg, meta) => log('debug', msg, { ...baseMeta, ...meta }),
    info: (msg, meta) => log('info', msg, { ...baseMeta, ...meta }),
    warn: (msg, meta) => log('warn', msg, { ...baseMeta, ...meta }),
    error: (msg, meta) => log('error', msg, { ...baseMeta, ...meta }),
  };
}

const _default = createLogger(null, null, 'app');

module.exports = {
  createLogger,
  log,
  error: (msg, meta) => _default.error(msg, meta),
  warn: (msg, meta) => _default.warn(msg, meta),
  info: (msg, meta) => _default.info(msg, meta),
  debug: (msg, meta) => _default.debug(msg, meta),
};
