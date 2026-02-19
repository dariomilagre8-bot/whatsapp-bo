// Módulo de expiração: liberta perfis cuja data de venda já passou do período de validade (ex.: 30 dias)
const { fetchAllRows, todayDate, markProfileAvailable } = require('./googleSheets');

const DIAS_VALIDADE = parseInt(process.env.DIAS_VALIDADE_EXPIRACAO, 10) || 30;

function parseDateDDMMYYYY(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split(/[/\-.]/);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const d = new Date(year, month, day);
  if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) return null;
  return d;
}

function isExpired(dataVendaStr) {
  const dataVenda = parseDateDDMMYYYY(dataVendaStr);
  if (!dataVenda) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fimValidade = new Date(dataVenda);
  fimValidade.setDate(fimValidade.getDate() + DIAS_VALIDADE);
  fimValidade.setHours(0, 0, 0, 0);
  return hoje >= fimValidade;
}

async function checkExpiration() {
  try {
    const rows = await fetchAllRows();
    if (!rows || rows.length <= 1) return;
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = (row[5] || '').toString().toLowerCase();
      const dataVenda = (row[7] || '').toString().trim();
      const isIndisponivel = status.includes('indispon');
      if (isIndisponivel && dataVenda && isExpired(dataVenda)) {
        await markProfileAvailable(i + 1);
        count++;
      }
    }
    if (count > 0) console.log(`[Expiracao] ${count} perfil(is) libertado(s) por expiração.`);
  } catch (e) {
    console.error('[Expiracao] Erro:', e.message);
  }
}

function startExpirationInterval() {
  const intervalMs = (parseInt(process.env.EXPIRACAO_INTERVAL_MINUTES, 10) || 60) * 60 * 1000;
  checkExpiration();
  setInterval(checkExpiration, intervalMs);
}

module.exports = { checkExpiration, startExpirationInterval };
