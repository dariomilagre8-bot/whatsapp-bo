// src/integrations/google-sheets.js

const { google } = require('googleapis');
let sheets = null;
let spreadsheetId = null;

/** Sanitização absoluta: trim, lowercase, NFD, remove acentos. Usar em TODAS as leituras de colunas antes de comparação. */
const normalizeText = (text) => text ? text.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';

/** Normaliza plataforma para comparação. CRÍTICO: substituir ligadura U+FB02 ANTES do normalize('NFD'); NFD decompõe a ligadura tornando o replace subsequente ineficaz. */
const normalizePlatformForMatch = (raw) => {
  const s = String(raw ?? '').replace(/\uFB02/g, 'fl').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s;
};

/** True se o texto normalizado deve ser considerado Netflix (aceita netflix, netfix, net flix, etc.). */
const isNetflixPlatform = (raw) => {
  const s = normalizePlatformForMatch(raw);
  return s.includes('netflix') || s.includes('netfix') || (s.includes('net') && s.includes('flix'));
};

/** Devolve 'Netflix' | 'Prime Video' | null a partir do valor da célula. */
const platformFromCell = (raw) => {
  const s = normalizePlatformForMatch(raw);
  if (isNetflixPlatform(s)) return 'Netflix';
  if (s.includes('prime')) return 'Prime Video';
  return null;
};

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
      range: `${stockConfig.sheetName}!A:Z`,
    });

    const rows = res.data.values || [];
    const stock = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const platformRaw = (row[0] != null && String(row[0]).trim()) ? row[0] : row[1];
      const platform = platformFromCell(platformRaw);
      const status = normalizeText(String(row[5] ?? ''));
      const isAvailable = status === 'disponivel';
      if (!isAvailable || !platform) continue;
      if (!stock[platform]) stock[platform] = 0;
      stock[platform]++;
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
      range: `${stockConfig.sheetName}!A:Z`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return 'Nenhum plano disponível no momento. Todos os planos estão esgotados.';

    const cell = (row, idx) => (row[idx] != null ? String(row[idx]).trim() : '');
    const header = (rows[0] || []).map(h => normalizeText(h));
    const planKeywords = ['plano', 'perfil', 'tipo', 'categoria', 'plan', 'profile'];
    const hasPlanCol = planKeywords.some(kw => header[12] && header[12].includes(kw));
    const platformCol = 0;
    const statusCol = 5;
    const planCol = 12;
    const priceCol = 13;

    const counts = new Map();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const platformRaw = cell(row, platformCol) || cell(row, 1);
      const platform = platformFromCell(platformRaw);
      const status = normalizeText(String(cell(row, statusCol)));
      const isAvailable = status === 'disponivel';
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

/** Número de perfis que o plano exige: Individual 1, Partilha 2, Família 4, Família Completa 5. */
function getProfilesNeeded(pendingSaleString) {
  const text = normalizeText(pendingSaleString || '');
  if (/familia\s*completa|completa|5\s*perfil|5\s*pessoa/.test(text)) return 5;
  if (/familia|4\s*perfil|4\s*pessoa/.test(text)) return 4;
  if (/partilha|partilhado|2\s*perfil|2\s*pessoa|duas?\s*pessoa/.test(text)) return 2;
  return 1;
}

/**
 * Agrupamento dinâmico: conta APENAS linhas disponíveis cujo plano seja Individual (normalizeText).
 * Calcula Partilha/Família/Família Completa por matemática: floor(totalIndividual/2), /4, /5.
 * Retorno: { netflix_individual, netflix_partilha, netflix_familia, netflix_familia_completa, prime_* } e erro.
 */
const STOCK_PROMPT_TIMEOUT_MS = 12000;

function isRowIndividualPlan(rawPlan, hasPlanCol) {
  if (!hasPlanCol) return true;
  const plano = normalizeText(rawPlan ?? '');
  if (!plano) return true; // célula vazia = tratar como Individual
  // Usa 'individu' para capturar tanto 'individual' quanto o erro 'individua' da planilha
  return plano.includes('individu') || /perfil\s*1|1\s*perfil/.test(plano);
}

async function getStockCountsForPrompt(stockConfig) {
  if (!sheets || !spreadsheetId) return { counts: null, erro: 'ERRO DE SINCRONIZAÇÃO' };

  const fetchPromise = sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${stockConfig.sheetName}!A:Z`,
  });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('STOCK_TIMEOUT')), STOCK_PROMPT_TIMEOUT_MS)
  );

  try {
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    const rows = res.data.values || [];
    const emptyCounts = { netflix_individual: 0, netflix_partilha: 0, netflix_familia: 0, netflix_familia_completa: 0, prime_individual: 0, prime_partilha: 0, prime_familia: 0, prime_familia_completa: 0 };
    if (rows.length < 1) return { counts: emptyCounts, erro: null };

    const firstCell = normalizePlatformForMatch(rows[0][0] ?? rows[0][1]);
    const looksLikeHeader = /plataforma|email|senha|status|plano|nome|telefone|valor/.test(firstCell);
    const firstRowIsData = !looksLikeHeader && (isNetflixPlatform(firstCell) || firstCell.includes('prime'));
    const startIndex = firstRowIsData ? 0 : 1;

    let totalNetflixIndividual = 0;
    let totalPrimeIndividual = 0;

    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      const platformRaw = (row[0] != null && String(row[0]).trim()) ? row[0] : row[1];
      const plataforma = normalizePlatformForMatch(platformRaw);
      const status = normalizeText(String(row[5] ?? ''));
      if (status !== 'disponivel') continue;
      if (isNetflixPlatform(plataforma)) totalNetflixIndividual++;
      if (plataforma.includes('prime')) totalPrimeIndividual++;
    }

    if (totalNetflixIndividual === 0 && rows.length > startIndex) {
      const sample = rows.slice(startIndex, startIndex + 3).map((r, j) => ({
        sheetRow: startIndex + j + 1,
        col0: r[0],
        col5: r[5],
        platformNorm: normalizePlatformForMatch(r[0] ?? r[1]),
        statusNorm: normalizeText(String(r[5] ?? '')),
      }));
      console.warn('[STOCK] Netflix count 0 – amostra:', { sheetName: stockConfig.sheetName, startIndex, sample });
    }

    const counts = {
      netflix_individual: totalNetflixIndividual,
      netflix_partilha: Math.floor(totalNetflixIndividual / 2),
      netflix_familia: Math.floor(totalNetflixIndividual / 4),
      netflix_familia_completa: Math.floor(totalNetflixIndividual / 5),
      prime_individual: totalPrimeIndividual,
      prime_partilha: Math.floor(totalPrimeIndividual / 2),
      prime_familia: Math.floor(totalPrimeIndividual / 4),
      prime_familia_completa: Math.floor(totalPrimeIndividual / 5),
    };
    return { counts, erro: null };
  } catch (err) {
    console.error('[STOCK] getStockCountsForPrompt Error:', err.message);
    return { counts: null, erro: 'ERRO DE SINCRONIZAÇÃO' };
  }
}

/**
 * Verifica se há linhas individuais disponíveis suficientes para o plano (N perfis = N linhas Individual).
 */
async function hasStockForPendingSale(stockConfig, pendingSaleString) {
  if (!sheets || !spreadsheetId) return false;
  const required = getProfilesNeeded(pendingSaleString);
  const text = normalizeText(pendingSaleString);
  const platform = text.includes('netflix') ? 'Netflix' : text.includes('prime') ? 'Prime Video' : null;
  if (!platform) return false;

  const cell = (row, idx) => (row[idx] != null ? String(row[idx]).trim() : '');

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${stockConfig.sheetName}!A:Z`,
    });
    const rows = res.data.values || [];
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const platformRaw = cell(row, COLS.platform) || cell(row, 1);
      const rowPlatform = platformFromCell(platformRaw);
      if (rowPlatform !== platform) continue;
      if (normalizeText(cell(row, COLS.status)) !== 'disponivel') continue;
      count++;
      if (count >= required) return true;
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
 * Alocação múltipla: identifica N perfis (1/2/4/5), procura N linhas Individual disponíveis,
 * marca todas como vendido e devolve email/senha + lista de perfis (PINs).
 * @returns {Promise<{ email: string, senha: string, pin: string, perfis: Array<{ pin: string }> }|null>}
 */
async function allocateProfile(stockConfig, pendingSaleString, customerName, customerPhone) {
  if (!sheets || !spreadsheetId) return null;

  const text = normalizeText(pendingSaleString);
  const platform = text.includes('netflix') ? 'Netflix' : text.includes('prime') ? 'Prime Video' : null;
  if (!platform) return null;

  const required = getProfilesNeeded(pendingSaleString);
  const cell = (row, idx) => (row[idx] != null ? String(row[idx]).trim() : '');

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${stockConfig.sheetName}!A:Z`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return null;

    const candidateRows = [];
    for (let i = 1; i < rows.length && candidateRows.length < required; i++) {
      const row = rows[i];
      const platformRaw = cell(row, COLS.platform) || cell(row, 1);
      const rowPlatform = platformFromCell(platformRaw);
      if (rowPlatform !== platform) continue;
      if (normalizeText(cell(row, COLS.status)) !== 'disponivel') continue;
      candidateRows.push({ rowIndex: i, row });
    }

    if (candidateRows.length < required) return null;

    const dateStr = new Date().toISOString().slice(0, 10);
    const toUpdate = candidateRows.slice(0, required);

    for (const { rowIndex, row } of toUpdate) {
      const sheetRow = rowIndex + 1;
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
    }

    const first = toUpdate[0].row;
    const email = cell(first, COLS.email);
    const senha = cell(first, COLS.senha);
    const perfis = toUpdate.map(({ row }, idx) => ({ pin: cell(row, COLS.pin) || '' }));
    const pin = perfis[0]?.pin || '';

    return { email, senha, pin, perfis };
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
