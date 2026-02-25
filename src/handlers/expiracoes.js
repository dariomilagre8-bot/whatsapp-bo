// Scheduler de expiração (9h) + broadcast — delega para expiracao-modulo
const expiracaoModulo = require('../../expiracao-modulo');

/**
 * Inicia o scheduler diário às 9h e expõe verificarExpiracoes para uso em rotas admin.
 * @param {Object} deps - { sendWhatsAppMessage, MAIN_BOSS, branding, fetchAllRows, markProfileAvailable, isIndisponivel }
 */
function initExpiracaoScheduler(deps) {
  expiracaoModulo.iniciar(deps);
}

module.exports = { initExpiracaoScheduler, verificarExpiracoes: expiracaoModulo.verificarExpiracoes };
