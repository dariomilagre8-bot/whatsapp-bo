/**
 * [CPA] Contexto da instância Evolution API por pedido (webhook).
 * Permite que o bot responda pela mesma instância que recebeu a mensagem,
 * quando várias instâncias (produção + Zara-Teste) usam o mesmo webhook.
 */
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Obtém o nome da instância do webhook actual (se existir).
 * @returns {string|null} Nome da instância ou null
 */
function getInstanceName() {
  const store = storage.getStore();
  return store?.instanceName ?? null;
}

/**
 * Executa fn dentro de um contexto onde a instância é instanceName.
 * @param {string|null} instanceName
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>}
 */
function runWithInstance(instanceName, fn) {
  return storage.run({ instanceName: instanceName || null }, fn);
}

module.exports = {
  getInstanceName,
  runWithInstance,
};
