// src/stock/stock-summary.js — Resumo de stock actual (Google Sheets) para comando #stock do supervisor

const { getStockCountsForPrompt } = require('../integrations/google-sheets');

const LABELS = {
  netflix_individual: 'Netflix Individual',
  netflix_partilha: 'Netflix Partilha',
  netflix_familia: 'Netflix Família',
  netflix_familia_completa: 'Netflix Família Completa',
  prime_individual: 'Prime Individual',
  prime_partilha: 'Prime Partilha',
  prime_familia: 'Prime Família',
  prime_familia_completa: 'Prime Família Completa',
};

/**
 * Lê o stock actual da Google Sheets e devolve mensagem formatada para o supervisor.
 * @param {object} stockConfig - config.stock (sheetName, etc.)
 * @returns {Promise<string>}
 */
async function getStockResumo(stockConfig) {
  const { counts, erro } = await getStockCountsForPrompt(stockConfig);
  if (erro || !counts) {
    return `❌ Erro ao ler stock: ${erro || 'dados indisponíveis'}.`;
  }
  let msg = '📦 *Stock actual:*\n';
  for (const [key, label] of Object.entries(LABELS)) {
    const n = counts[key] != null ? counts[key] : 0;
    msg += `• ${label}: ${n}\n`;
  }
  return msg.trim();
}

module.exports = { getStockResumo };
