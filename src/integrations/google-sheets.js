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

module.exports = { init, getStock };
