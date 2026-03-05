// src/integrations/google-sheets.js

const { google } = require('googleapis');
let sheets = null;
let spreadsheetId = null;

function init(credentialsPath, sheetId) {
  spreadsheetId = sheetId;
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  sheets = google.sheets({ version: 'v4', auth });
}

async function getStock(stockConfig) {
  if (!sheets) return {};

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${stockConfig.sheetName}!A:J`,
    });

    const rows = res.data.values || [];
    const stock = {};

    // Normalizar plataforma para chave canónica (insensível a maiúsculas/espaços)
    const normalizePlatform = (raw) => {
      const s = (raw || '').toString().trim().toLowerCase();
      if (s === 'netflix') return 'Netflix';
      if (s === 'prime video' || s === 'prime') return 'Prime Video';
      return (raw || '').toString().trim();
    };

    // Normalizar texto para comparação (remove acentos: disponível -> disponivel)
    const normalizeForStatus = (str) =>
      (str || '').toString().trim().toLowerCase()
        .normalize('NFD').replace(/\p{Diacritic}/gu, '');

    // Contar linhas disponíveis por plataforma
    for (let i = 1; i < rows.length; i++) { // skip header
      const row = rows[i];
      const platformValue = row[0];
      const statusValue = row[5];
      const platform = normalizePlatform(platformValue); // Coluna A
      const statusStr = normalizeForStatus(statusValue); // Coluna F
      const isAvailable = statusStr.includes('disponivel') && !statusStr.includes('indisponivel');

      console.log('DEBUG STOCK:', platformValue, statusValue);

      if (!stock[platform]) stock[platform] = 0;
      if (isAvailable) {
        stock[platform]++;
      }
    }

    console.log(`[STOCK] Netflix: ${stock['Netflix'] || 0}, Prime Video: ${stock['Prime Video'] || 0}`);
    return stock;
  } catch (err) {
    console.error('[STOCK] Error:', err.message);
    return {};
  }
}

/**
 * Normaliza nome do plano (planilha pode ter "Perfil 1", "Individual", "Partilha", "Família", "Conta Completa", etc.)
 */
function normalizePlanName(raw) {
  const s = (raw || '').toString().trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (s.includes('individual') || s === 'perfil 1' || s === '1 perfil') return 'Individual';
  if (s.includes('partilha') || s.includes('partilhado')) return 'Partilha';
  if (s.includes('família') || s.includes('familia') || s.includes('completa') || s.includes('5 perfil')) return 'Conta Completa (5 Perfis)';
  return (raw || '').toString().trim() || 'Plano';
}

/**
 * Lê a planilha e agrupa por Plataforma + Plano + Valor, devolvendo CONTAGENS
 * em vez de listar todas as linhas (reduz tamanho do prompt e evita repetição).
 * Colunas: A=Plataforma, D=Plano (opcional), F=Status, H=Preço/Valor.
 * Saída: "Netflix - Individual (5000 Kz): 12 perfis" ou "Netflix - Familia_Completa (13500 Kz): 2 contas".
 */
async function getInventoryForPrompt(stockConfig, productsConfig) {
  if (!sheets) return 'Nenhum dado de inventário disponível no momento.';

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${stockConfig.sheetName}!A:J`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return 'Nenhum plano disponível no momento. Todos os planos estão esgotados.';

    const normalizeForStatus = (str) =>
      (str || '').toString().trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const normalizePlatform = (raw) => {
      const s = (raw || '').toString().trim().toLowerCase();
      if (s === 'netflix') return 'Netflix';
      if (s === 'prime video' || s === 'prime') return 'Prime Video';
      return (raw || '').toString().trim();
    };

    const header = (rows[0] || []).map(h => normalizeForStatus(h));
    const planKeywords = ['plano', 'perfil', 'tipo', 'categoria', 'plan', 'profile'];
    const hasPlanCol = planKeywords.some(kw => header[3] && header[3].includes(kw));

    const platformCol = 0;
    const planCol = 3;
    const statusCol = 5;
    const priceCol = 7;

    /** key -> count (agrupa linhas iguais) */
    const counts = new Map();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const platform = normalizePlatform(row[platformCol]);
      const statusStr = normalizeForStatus(row[statusCol] ?? '');
      const isAvailable = statusStr.includes('disponivel') && !statusStr.includes('indisponivel');
      if (!isAvailable || !platform) continue;

      const rawPlan = hasPlanCol ? (row[planCol] || '').toString().trim() : '';
      const rawPrice = row[priceCol];
      const value = (typeof rawPrice === 'number'
        ? rawPrice
        : parseInt(String(rawPrice || '0').replace(/\D/g, ''), 10)) || 0;

      const key = rawPlan ? `${platform}|${rawPlan}|${value}` : `${platform}||${value}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const parts = [];
    for (const [key, count] of counts) {
      const segs = key.split('|');
      const platform = segs[0] || '';
      const rawPlan = segs[1] || '';
      const valueDisplay = segs[2] || segs[segs.length - 1] || '0';
      const planLabel = rawPlan || 'Plano';
      const isConta = /familia|completa|completo|5\s*perfil/i.test(planLabel);
      const unidade = isConta ? 'contas' : 'perfis';
      parts.push(`${platform} - ${planLabel} (${valueDisplay} Kz): ${count} ${unidade}`);
    }
    parts.sort();

    return parts.length
      ? parts.join('\n')
      : 'Nenhum plano disponível no momento. Todos os planos estão esgotados.';
  } catch (err) {
    console.error('[STOCK] getInventoryForPrompt Error:', err.message);
    return 'Erro ao carregar inventário. Não invente preços.';
  }
}

module.exports = {
  init,
  getStock,
  getInventoryForPrompt,
};
