/**
 * Memória local em Map() com TTL — substituto do Redis para este projecto.
 * Dados perdem-se ao reiniciar o servidor (aceitável).
 * Limpeza de entradas expiradas a cada 5 minutos.
 */

const store = new Map(); // chave -> { value, expiresAt }

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

function _now() {
  return Math.floor(Date.now() / 1000);
}

function _isExpired(expiresAt) {
  return expiresAt != null && _now() >= expiresAt;
}

function _cleanup() {
  const now = _now();
  for (const [k, entry] of store.entries()) {
    if (entry.expiresAt != null && now >= entry.expiresAt) {
      store.delete(k);
    }
  }
}

let cleanupTimer = null;
function _startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(_cleanup, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}
_startCleanup();

/**
 * Guarda valor com TTL em segundos.
 * @param {string} chave
 * @param {*} valor
 * @param {number} ttlSegundos
 */
function set(chave, valor, ttlSegundos) {
  const expiresAt = ttlSegundos != null ? _now() + ttlSegundos : null;
  store.set(chave, { value: valor, expiresAt });
}

/**
 * Obtém valor; retorna null se não existir ou tiver expirado.
 * @param {string} chave
 * @returns {*|null}
 */
function get(chave) {
  const entry = store.get(chave);
  if (!entry) return null;
  if (_isExpired(entry.expiresAt)) {
    store.delete(chave);
    return null;
  }
  return entry.value;
}

/**
 * Incrementa contador (para recusas, etc.). Cria com 0 se não existir.
 * Renova TTL a cada incr.
 * @param {string} chave
 * @param {number} ttlSegundos
 * @returns {number} valor após incremento
 */
function incr(chave, ttlSegundos) {
  const entry = store.get(chave);
  let next = 1;
  if (entry && !_isExpired(entry.expiresAt)) {
    const n = entry.value;
    next = (typeof n === 'number' ? n : 0) + 1;
  }
  set(chave, next, ttlSegundos);
  return next;
}

/**
 * Apaga entrada.
 * @param {string} chave
 */
function del(chave) {
  store.delete(chave);
}

const memoriaLocal = { set, get, incr, del };

module.exports = { memoriaLocal };
module.exports.memoriaLocal = memoriaLocal;
