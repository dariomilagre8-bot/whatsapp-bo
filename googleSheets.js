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
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ==================== LEITURA / ESCRITA ====================
// Colunas: A=Plataforma B=Email C=Senha D=NomePerfil E=Pin F=Status G=Cliente H=Data_Venda I=QNTD_PERFIS J=Tipo_Conta
async function fetchAllRows() {
  try {
    const res = await sheetsAPI.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:J`,
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

// FIX: Validacao de null/undefined antes de escrever; H=DD/MM/YYYY, I=inteiro de slots
async function markProfileSold(rowIndex, clientName, clientNumber, planSlots) {
  const clientLabel = clientName ? `${clientName} - ${clientNumber}` : (clientNumber || '');
  const saleDate = todayDate(); // FIX: formato DD/MM/YYYY garantido
  const slotsInt = parseInt(planSlots, 10) || 0; // FIX: garantir inteiro, nunca undefined

  // FIX: validacao — so escreve se valores sao validos
  if (!rowIndex || !clientLabel) {
    console.error('markProfileSold: rowIndex ou clientLabel invalido', { rowIndex, clientLabel });
    return;
  }

  await updateSheetCell(rowIndex, 'F', 'Indisponivel');
  await updateSheetCell(rowIndex, 'G', clientLabel);
  await updateSheetCell(rowIndex, 'H', saleDate);      // FIX: sempre DD/MM/YYYY
  await updateSheetCell(rowIndex, 'I', slotsInt);       // FIX: sempre inteiro
}

async function markProfileAvailable(rowIndex) {
  await updateSheetCell(rowIndex, 'F', 'Disponivel');
  await updateSheetCell(rowIndex, 'G', '');
  await updateSheetCell(rowIndex, 'H', '');  // Data_Venda
  await updateSheetCell(rowIndex, 'I', '');  // QNTD_PERFIS
}

// ==================== CONSULTAS ====================

// Conta linhas Indisponivel de um email (cada linha = 1 slot ocupado)
function getEmailSlotUsage(rows, email) {
  let used = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowEmail = (row[1] || '').toLowerCase().trim();
    const status = (row[5] || '').toLowerCase();
    if (rowEmail === email.toLowerCase().trim() && status.includes('indispon')) {
      used += 1;
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
        dataVenda: row[7] || '',
        qntdPerfis: row[8] || '',
        tipoConta: row[9] || ''
      };
    }
  }
  return null;
}

// Encontra perfil disponível com slots suficientes
// profileType: 'full_account' | 'shared_profile' | undefined (backward-compatible)
async function findAvailableProfile(plataforma, slotsNeeded, profileType) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowPlat = (row[0] || '').toLowerCase();
    const status = (row[5] || '').toLowerCase();
    const email = (row[1] || '');
    const tipoConta = (row[9] || '').toLowerCase().trim();
    const rowType = tipoConta || 'shared_profile'; // Linhas sem coluna J = shared_profile

    if (!rowPlat.includes(plataforma.toLowerCase()) || !status.includes('dispon')) continue;

    // Se profileType foi especificado, filtrar por tipo
    if (profileType && rowType !== profileType) continue;

    if (rowType === 'full_account') {
      // full_account: 1 linha = 1 conta inteira, sem matemática de slots
      return {
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: email,
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        slotsUsed: 0,
        slotsFree: 1
      };
    } else {
      // shared_profile: lógica existente (5 - used >= slotsNeeded)
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
  }
  return null;
}

// Encontra múltiplos perfis disponíveis do MESMO email (para planos multi-slot)
// Individual=1, Partilha=2
async function findAvailableProfiles(plataforma, slotsNeeded, profileType) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;

  // full_account: cada linha = 1 conta inteira, buscar slotsNeeded contas
  if (profileType === 'full_account') {
    const accounts = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowPlat = (row[0] || '').toLowerCase();
      const status = (row[5] || '').toLowerCase();
      const tipoConta = (row[9] || '').toLowerCase().trim();
      const rowType = tipoConta || 'shared_profile';
      if (!rowPlat.includes(plataforma.toLowerCase()) || !status.includes('dispon')) continue;
      if (rowType !== 'full_account') continue;
      accounts.push({
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
      });
      if (accounts.length >= slotsNeeded) return accounts;
    }
    return null;
  }

  // shared_profile: agrupar linhas disponíveis por email
  const emailGroups = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowPlat = (row[0] || '').toLowerCase();
    const status = (row[5] || '').toLowerCase();
    const email = (row[1] || '').trim();
    const tipoConta = (row[9] || '').toLowerCase().trim();
    const rowType = tipoConta || 'shared_profile';

    if (!rowPlat.includes(plataforma.toLowerCase())) continue;
    if (rowType !== 'shared_profile') continue;

    const emailKey = email.toLowerCase();
    if (!emailGroups[emailKey]) {
      emailGroups[emailKey] = { email, availableRows: [] };
    }
    if (status.includes('dispon')) {
      emailGroups[emailKey].availableRows.push({
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: email,
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
      });
    }
  }

  // FIX: Recolher perfis de MULTIPLOS emails quando um so nao tem slots suficientes
  // Isto resolve o problema de Qtd=2 Partilha (4 slots) quando nenhum email tem 4 livres
  const collected = [];
  for (const emailKey of Object.keys(emailGroups)) {
    const group = emailGroups[emailKey];
    if (group.availableRows.length === 0) continue;
    const used = getEmailSlotUsage(rows, group.email);
    const free = 5 - used;
    const canTake = Math.min(group.availableRows.length, free);
    if (canTake <= 0) continue;
    const needed = slotsNeeded - collected.length;
    const take = Math.min(canTake, needed);
    collected.push(...group.availableRows.slice(0, take));
    if (collected.length >= slotsNeeded) return collected;
  }
  return null; // Nao ha stock suficiente em nenhuma combinacao de emails
}

// Encontra todos os perfis existentes de um cliente (para renovações)
async function findClientProfiles(clientNumber) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;
  const cleanNum = cleanNumber(clientNumber);
  const profiles = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cliente = row[6] || '';
    if (cleanNumber(cliente) === cleanNum) {
      profiles.push({
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        cliente: cliente,
        dataVenda: row[7] || '',
        qntdPerfis: row[8] || '',
        tipoConta: row[9] || ''
      });
    }
  }
  return profiles.length > 0 ? profiles : null;
}

// Verifica se existe QUALQUER perfil disponível para a plataforma
// profileType opcional: filtra por tipo se fornecido
async function hasAnyStock(plataforma, profileType) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return false;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const tipoConta = (row[9] || '').toLowerCase().trim();
    const rowType = tipoConta || 'shared_profile';

    if ((row[0] || '').toLowerCase().includes(plataforma.toLowerCase()) &&
        (row[5] || '').toLowerCase().includes('dispon')) {
      if (!profileType || rowType === profileType) {
        return true;
      }
    }
  }
  return false;
}

// FIX: Conta perfis disponiveis para uma plataforma e tipo (para mensagem de stock insuficiente)
async function countAvailableProfiles(plataforma, profileType) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return 0;

  if (profileType === 'full_account') {
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowPlat = (row[0] || '').toLowerCase();
      const status = (row[5] || '').toLowerCase();
      const tipoConta = (row[9] || '').toLowerCase().trim();
      const rowType = tipoConta || 'shared_profile';
      if (!rowPlat.includes(plataforma.toLowerCase()) || !status.includes('dispon')) continue;
      if (rowType !== 'full_account') continue;
      count++;
    }
    return count;
  }

  // shared_profile: contar slots livres considerando limite de 5 por email
  const emailGroups = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowPlat = (row[0] || '').toLowerCase();
    const status = (row[5] || '').toLowerCase();
    const email = (row[1] || '').trim();
    const tipoConta = (row[9] || '').toLowerCase().trim();
    const rowType = tipoConta || 'shared_profile';
    if (!rowPlat.includes(plataforma.toLowerCase())) continue;
    if (rowType !== 'shared_profile') continue;
    const emailKey = email.toLowerCase();
    if (!emailGroups[emailKey]) emailGroups[emailKey] = { email, availCount: 0 };
    if (status.includes('dispon')) emailGroups[emailKey].availCount++;
  }

  let total = 0;
  for (const emailKey of Object.keys(emailGroups)) {
    const group = emailGroups[emailKey];
    if (group.availCount === 0) continue;
    const used = getEmailSlotUsage(rows, group.email);
    const free = 5 - used;
    const canTake = Math.min(group.availCount, free);
    if (canTake > 0) total += canTake;
  }
  return total;
}

// ==================== VENDAS PERDIDAS ====================
async function appendLostSale(sale) {
  try {
    await sheetsAPI.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'VendasPerdidas!A:G',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          sale.id,
          sale.phone,
          sale.clientName,
          sale.interests.join(', '),
          sale.lastState,
          sale.reason,
          new Date(sale.timestamp).toLocaleString('pt-PT')
        ]]
      }
    });
    return true;
  } catch (error) {
    console.error('Erro appendLostSale:', error.message);
    return false;
  }
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
  findAvailableProfiles,
  findClientProfiles,
  hasAnyStock,
  countAvailableProfiles,
  appendLostSale,
};
