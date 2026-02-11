const path = require('path');
const { google } = require('googleapis');

// ==================== CONFIG ====================
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Página1';

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheetsAPI = google.sheets({ version: 'v4', auth });

// ==================== HELPERS ====================
function cleanNumber(jid) {
  return jid ? jid.replace(/\D/g, '') : '';
}

function todayDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ==================== LEITURA / ESCRITA ====================
// Colunas: A=Plataforma B=Email C=Senha D=NomePerfil E=Pin F=Status G=Cliente H=QNTD_PERFIS I=Data_Venda
async function fetchAllRows() {
  try {
    const res = await sheetsAPI.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:I`,
    });
    return res.data.values || [];
  } catch (error) {
    console.error('Erro fetchAllRows:', error.message);
    return [];
  }
}

async function updateSheetCell(row, column, value) {
  try {
    await sheetsAPI.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!${column}${row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[value]] },
    });
    return true;
  } catch (error) {
    console.error('Erro updateSheetCell:', error.message);
    return false;
  }
}

async function markProfileSold(rowIndex, clientName, clientNumber, planSlots) {
  const clientLabel = clientName ? `${clientName} - ${clientNumber}` : clientNumber;
  await updateSheetCell(rowIndex, 'F', 'Indisponivel');
  await updateSheetCell(rowIndex, 'G', clientLabel);
  await updateSheetCell(rowIndex, 'H', planSlots);
  await updateSheetCell(rowIndex, 'I', todayDate());
}

async function markProfileAvailable(rowIndex) {
  await updateSheetCell(rowIndex, 'F', 'Disponivel');
  await updateSheetCell(rowIndex, 'G', '');
  await updateSheetCell(rowIndex, 'H', '');
  await updateSheetCell(rowIndex, 'I', '');
}

// ==================== CONSULTAS ====================

// Soma slots ocupados de um email (linhas Indisponivel)
function getEmailSlotUsage(rows, email) {
  let used = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowEmail = (row[1] || '').toLowerCase().trim();
    const status = (row[5] || '').toLowerCase();
    if (rowEmail === email.toLowerCase().trim() && status.includes('indispon')) {
      const qntd = parseInt(row[7] || '0', 10);
      used += qntd > 0 ? qntd : 1; // Default 1 para linhas antigas sem QNTD
    }
  }
  return used;
}

// Verifica se cliente já existe na planilha (coluna G)
async function checkClientInSheet(clientNumber) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;
  const cleanNum = cleanNumber(clientNumber);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cliente = row[6] || '';
    if (cleanNumber(cliente) === cleanNum) {
      const namePart = cliente.split(' - ')[0] || '';
      return {
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        cliente: cliente,
        clienteName: namePart.trim(),
        qntdPerfis: row[7] || '',
        dataVenda: row[8] || ''
      };
    }
  }
  return null;
}

// Encontra perfil disponível com slots suficientes no email
async function findAvailableProfile(plataforma, slotsNeeded) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowPlat = (row[0] || '').toLowerCase();
    const status = (row[5] || '').toLowerCase();
    const email = (row[1] || '');

    if (!rowPlat.includes(plataforma.toLowerCase()) || !status.includes('dispon')) continue;

    const used = getEmailSlotUsage(rows, email);
    const free = 5 - used;

    if (free >= slotsNeeded) {
      return {
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: email,
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        slotsUsed: used,
        slotsFree: free
      };
    }
  }
  return null;
}

// Verifica se existe QUALQUER perfil disponível para a plataforma
async function hasAnyStock(plataforma) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return false;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if ((row[0] || '').toLowerCase().includes(plataforma.toLowerCase()) &&
        (row[5] || '').toLowerCase().includes('dispon')) {
      return true;
    }
  }
  return false;
}

// ==================== EXPORTS ====================
module.exports = {
  cleanNumber,
  todayDate,
  fetchAllRows,
  updateSheetCell,
  markProfileSold,
  markProfileAvailable,
  checkClientInSheet,
  findAvailableProfile,
  hasAnyStock,
};
