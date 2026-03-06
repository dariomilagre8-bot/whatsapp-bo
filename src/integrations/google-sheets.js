// src/integrations/google-sheets.js

const { google } = require('googleapis');
let sheets = null;
let spreadsheetId = null;

/** Sanitização absoluta: trim, lowercase, NFD, remove acentos. Usar em TODAS as leituras de colunas antes de comparação. */
const normalizeText = (text) => text ? text.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';

function init(credentialsPath, sheetId) {
  spreadsheetId = sheetId;
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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

    const normalizePlatform = (raw) => {
      const s = normalizeText(raw);
      if (s.includes('netflix')) return 'Netflix';
      if (s.includes('prime')) return 'Prime Video';
      return (raw || '').toString().trim();
    };

    // Contar linhas disponíveis por plataforma (A=0, F=5)
    for (let i = 1; i < rows.length; i++) { // skip header
      const row = rows[i];
      const platformValue = row[0];
      const statusCell = row[5];
      const platform = normalizePlatform(platformValue);
      const isAvailable = normalizeText(statusCell) === 'disponivel';

      console.log('DEBUG STOCK:', platformValue, statusCell);

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
  const s = normalizeText(raw);
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
      range: `${stockConfig.sheetName}!A:N`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return 'Nenhum plano disponível no momento. Todos os planos estão esgotados.';

    const normalizePlatform = (raw) => {
      const s = normalizeText(raw);
      if (s.includes('netflix')) return 'Netflix';
      if (s.includes('prime')) return 'Prime Video';
      return (raw || '').toString().trim();
    };
    const cell = (row, idx) => (row[idx] != null ? String(row[idx]).trim() : '');

    const header = (rows[0] || []).map(h => normalizeText(h));
    const planKeywords = ['plano', 'perfil', 'tipo', 'categoria', 'plan', 'profile'];
    const hasPlanCol = planKeywords.some(kw => header[12] && header[12].includes(kw));

    const platformCol = 0;   // A
    const statusCol = 5;     // F
    const planCol = 12;      // M
    const priceCol = 13;     // N

    /** key -> count (agrupa linhas iguais) */
    const counts = new Map();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const platform = normalizePlatform(cell(row, platformCol));
      const statusCell = cell(row, statusCol);
      const isAvailable = normalizeText(statusCell) === 'disponivel';
      if (!isAvailable || !platform) continue;

      const rawPlan = hasPlanCol ? cell(row, planCol) : '';
      const rawPrice = cell(row, priceCol);
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

/**
 * Classifica o texto do plano em individual | partilha | familia (para contagens).
 */
function classifyPlanType(rawPlan) {
  const s = normalizeText(rawPlan);
  if (/familia|completa|completo|5\s*perfil/.test(s)) return 'familia';
  if (/partilha|partilhado/.test(s)) return 'partilha';
  if (/individual|perfil\s*1|1\s*perfil/.test(s)) return 'individual';
  return 'individual';
}

/**
 * Devolve contagens de stock por plataforma e tipo de plano para o prompt (verificação pré-pagamento).
 * Retorno: { netflix_individual, netflix_partilha, netflix_familia, prime_individual, prime_partilha, prime_familia } e erro: string | null.
 */
const STOCK_PROMPT_TIMEOUT_MS = 12000;

async function getStockCountsForPrompt(stockConfig) {
  if (!sheets || !spreadsheetId) return { counts: null, erro: 'ERRO DE SINCRONIZAÇÃO' };

  const fetchPromise = sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${stockConfig.sheetName}!A:N`,
  });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('STOCK_TIMEOUT')), STOCK_PROMPT_TIMEOUT_MS)
  );

  try {
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    const rows = res.data.values || [];
    if (rows.length < 2) return { counts: { netflix_individual: 0, netflix_partilha: 0, netflix_familia: 0, prime_individual: 0, prime_partilha: 0, prime_familia: 0 }, erro: null };

    const normalizePlatform = (raw) => {
      const s = normalizeText(raw);
      if (s.includes('netflix')) return 'Netflix';
      if (s.includes('prime')) return 'Prime Video';
      return (raw || '').toString().trim();
    };
    const cell = (row, idx) => (row[idx] != null ? String(row[idx]).trim() : '');

    const counts = { netflix_individual: 0, netflix_partilha: 0, netflix_familia: 0, prime_individual: 0, prime_partilha: 0, prime_familia: 0 };
    const header = (rows[0] || []).map(h => normalizeText(h));
    const planKeywords = ['plano', 'perfil', 'tipo', 'categoria', 'plan', 'profile'];
    const hasPlanCol = planKeywords.some(kw => header[12] && header[12].includes(kw));

    const platformCol = 0;
    const statusCol = 5;
    const planCol = 12;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const platform = normalizePlatform(cell(row, platformCol));
      const statusCell = cell(row, statusCol);
      const isAvailable = normalizeText(statusCell) === 'disponivel';
      if (!isAvailable || !platform) continue;

      const rawPlan = hasPlanCol ? cell(row, planCol) : '';
      const planType = classifyPlanType(rawPlan);
      const key = platform === 'Netflix' ? `netflix_${planType}` : `prime_${planType}`;
      if (counts[key] !== undefined) counts[key]++;
    }

    return { counts, erro: null };
  } catch (err) {
    console.error('[STOCK] getStockCountsForPrompt Error:', err.message);
    return { counts: null, erro: 'ERRO DE SINCRONIZAÇÃO' };
  }
}

/**
 * Verifica se ainda existe pelo menos uma linha disponível para o pendingSale (re-check antes de #sim).
 */
async function hasStockForPendingSale(stockConfig, pendingSaleString) {
  if (!sheets || !spreadsheetId) return false;
  const normalizePlatform = (raw) => {
    const s = normalizeText(raw);
    if (s.includes('netflix')) return 'Netflix';
    if (s.includes('prime')) return 'Prime Video';
    return (raw || '').toString().trim();
  };
  const text = normalizeText(pendingSaleString);
  const platform = text.includes('netflix') ? 'Netflix' : text.includes('prime') ? 'Prime Video' : null;
  if (!platform) return false;

  const wantsIndividual = /individual|1\s*perfil|perfil\s*1|sozinho/i.test(pendingSaleString);
  const wantsPartilha = /partilha|partilhado|2\s*perfil/i.test(pendingSaleString);
  const wantsFamilia = /familia|completa|completo|5\s*perfil/i.test(pendingSaleString);

  const cell = (row, idx) => (row[idx] != null ? String(row[idx]).trim() : '');

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${stockConfig.sheetName}!A:N`,
    });
    const rows = res.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowPlatform = normalizePlatform(cell(row, COLS.platform));
      const statusCell = cell(row, COLS.status);
      const isAvailable = normalizeText(statusCell) === 'disponivel';
      if (!isAvailable || rowPlatform !== platform) continue;
      const rowPlan = normalizeText(cell(row, COLS.plan));
      const matchPlan = (wantsFamilia && /familia|completa|completo|5/.test(rowPlan)) ||
        (wantsPartilha && /partilha|partilhado/.test(rowPlan)) ||
        (wantsIndividual && /individual|perfil\s*1|1\s*perfil/.test(rowPlan)) ||
        (!wantsFamilia && !wantsPartilha && !wantsIndividual);
      if (matchPlan) return true;
    }
    return false;
  } catch (err) {
    console.error('[STOCK] hasStockForPendingSale Error:', err.message);
    return false;
  }
}

/**
 * Mapeamento de colunas da planilha (0-based), alinhado à planilha real.
 * A=Plataforma, B=Email, C=Senha, F=Status, G=Cliente, H=Telefone, I=Data_Ver, M=Plano, N=Valor
 * Escrita segura: atualizamos APENAS F a I (Status, Cliente, Telefone, Data_Ver).
 */
const COLS = {
  platform: 0,   // A
  email: 1,       // B
  senha: 2,       // C
  status: 5,      // F - escrevemos "vendido"
  cliente: 6,     // G
  telefone: 7,    // H - WhatsApp
  dataVer: 8,     // I - data da aprovação
  plan: 12,       // M
  pin: 4,         // E (se existir na planilha)
};

/**
 * Procura a primeira linha disponível que corresponda ao pacote vendido (pendingSaleString),
 * atualiza Status=vendido, Cliente, Telefone, Data_Ver e devolve os dados de acesso.
 * @param {object} stockConfig - { sheetName }
 * @param {string} pendingSaleString - ex: "Netflix Família Completa" ou "Netflix - Familia_Completa - 13500 Kz"
 * @param {string} customerName
 * @param {string} customerPhone
 * @returns {Promise<{ email: string, senha: string, pin: string }|null>}
 */
async function allocateProfile(stockConfig, pendingSaleString, customerName, customerPhone) {
  if (!sheets || !spreadsheetId) return null;

  const normalizePlatform = (raw) => {
    const s = normalizeText(raw);
    if (s.includes('netflix')) return 'Netflix';
    if (s.includes('prime')) return 'Prime Video';
    return (raw || '').toString().trim();
  };

  // Extrair plataforma e plano do texto da venda
  const text = normalizeText(pendingSaleString);
  const isNetflix = text.includes('netflix');
  const isPrime = text.includes('prime');
  const platform = isNetflix ? 'Netflix' : isPrime ? 'Prime Video' : null;
  if (!platform) return null;

  const planMatch = text.replace(/netflix|prime|video|\d+|kz|\.|,/gi, '').trim();
  const wantsIndividual = /individual|1\s*perfil|perfil\s*1|sozinho/i.test(pendingSaleString) || /individual/.test(planMatch);
  const wantsPartilha = /partilha|partilhado|2\s*perfil/i.test(pendingSaleString) || /partilha/.test(planMatch);
  const wantsFamilia = /familia|completa|completo|5\s*perfil/i.test(pendingSaleString) || /familia|completa/.test(planMatch);

  const cell = (row, idx) => (row[idx] != null ? String(row[idx]).trim() : '');

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${stockConfig.sheetName}!A:N`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return null;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowPlatform = normalizePlatform(cell(row, COLS.platform));
      const statusCell = cell(row, COLS.status);
      const isAvailable = normalizeText(statusCell) === 'disponivel';
      if (!isAvailable || rowPlatform !== platform) continue;

      const rowPlan = normalizeText(cell(row, COLS.plan));
      const matchPlan = (wantsFamilia && /familia|completa|completo|5/.test(rowPlan)) ||
        (wantsPartilha && /partilha|partilhado/.test(rowPlan)) ||
        (wantsIndividual && /individual|perfil\s*1|1\s*perfil/.test(rowPlan)) ||
        (!wantsFamilia && !wantsPartilha && !wantsIndividual);
      if (!matchPlan && (wantsIndividual || wantsPartilha || wantsFamilia)) continue;

      const sheetRow = i + 1;
      const dateStr = new Date().toISOString().slice(0, 10);

      // Re-check atómico: confirmar que a linha continua disponível antes de escrever (evitar duplicidade)
      try {
        const recheck = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${stockConfig.sheetName}!F${sheetRow}:F${sheetRow}`,
        });
        const recheckStatus = normalizeText((recheck.data.values || [])[0]?.[0] ?? '');
        if (recheckStatus !== 'disponivel') {
          console.log('[STOCK] allocateProfile: linha já ocupada no último segundo, abortar');
          return null;
        }
      } catch (e) {
        console.error('[STOCK] allocateProfile re-check:', e.message);
        return null;
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${stockConfig.sheetName}!F${sheetRow}:I${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            'vendido',
            customerName || 'Cliente',
            customerPhone || '',
            dateStr,
          ]],
        },
      });

      return {
        email: cell(row, COLS.email),
        senha: cell(row, COLS.senha),
        pin: cell(row, COLS.pin),
      };
    }
    return null;
  } catch (err) {
    console.error('[STOCK] allocateProfile Error:', err.message);
    return null;
  }
}

module.exports = {
  init,
  getStock,
  getInventoryForPrompt,
  getStockCountsForPrompt,
  hasStockForPendingSale,
  allocateProfile,
};
