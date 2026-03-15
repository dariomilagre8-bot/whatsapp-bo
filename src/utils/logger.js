// src/utils/logger.js
// Logs estruturados com níveis e timestamp

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function format(level, module, message, meta) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] [${module}] ${message}`;
  return meta ? `${base} ${JSON.stringify(meta)}` : base;
}

function createLogger(module) {
  return {
    debug: (msg, meta) => {
      if (CURRENT_LEVEL <= LEVELS.debug) console.debug(format('debug', module, msg, meta));
    },
    info: (msg, meta) => {
      if (CURRENT_LEVEL <= LEVELS.info) console.log(format('info', module, msg, meta));
    },
    warn: (msg, meta) => {
      if (CURRENT_LEVEL <= LEVELS.warn) console.warn(format('warn', module, msg, meta));
    },
    error: (msg, meta) => {
      if (CURRENT_LEVEL <= LEVELS.error) console.error(format('error', module, msg, meta));
    },
  };
}

// Instância padrão para uso directo: const logger = require('../utils/logger')
const _default = createLogger('app');

module.exports = {
  createLogger,
  error: (msg, meta) => _default.error(msg, meta),
  warn:  (msg, meta) => _default.warn(msg, meta),
  info:  (msg, meta) => _default.info(msg, meta),
  debug: (msg, meta) => _default.debug(msg, meta),
};
