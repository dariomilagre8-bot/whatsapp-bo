const path = require('path');
const { google } = require('googleapis');

// ==================== CONFIG ====================
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
// Nome da aba — define SHEET_NAME no Easypanel se for diferente
const SHEET_NAME = process.env.SHEET_NAME || 'Página1';

// ── Helpers de status — robustos contra acentos, maiusculas e espacos ──
// A Sheet pode ter: "disponivel", "Disponivel", "disponível", "Disponível"
// Todas são aceites correctamente
function normalizeStatus(s) {
  return (s || '').toString().toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function isDisponivel(statusCell) {
  const n = normalizeStatus(statusCell);
  return n.includes('dispon') && !n.includes('indispon');
}
function isIndisponivel(statusCell) {
  const n = normalizeStatus(statusCell);
  // Slot ocupado: "indisponivel" (padrão) ou "activo" (variante aceite)
  return n.includes('indispon') || n === 'activo';
}
// Normaliza nome de plataforma para comparacao com a Sheet
function normalizePlataforma(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (s.includes('netflix')) return 'netflix';
  if (s.includes('prime')) return 'prime';
  return s;
}

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheetsAPI = google.sheets({ version: 'v4', auth });

// ==================== HELPERS ====================
function cleanNumber(jid) {
  return jid ? String(jid).replace(/\D/g, '') : '';
}

function todayDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Último dia do mês seguinte (Data_Expiracao das novas vendas)
function nextMonthLastDay() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  return `${String(last.getDate()).padStart(2, '0')}/${String(last.getMonth() + 1).padStart(2, '0')}/${last.getFullYear()}`;
}

// ==================== LEITURA / ESCRITA ====================
// Schema (A:N):
//   A=Plataforma[0]  B=Email[1]       C=Senha[2]       D=NomePerfil[3]  E=PIN[4]
//   F=Status[5]      G=Cliente[6]     H=Telefone[7]    I=Data_Venda[8]  J=Data_Expiracao[9]
//   K=QNTD[10]       L=Tipo_Conta[11] M=Plano[12]      N=Valor[13]
async function fetchAllRows() {
  try {
    const res = await sheetsAPI.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:N`,
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

// Regista uma venda: actualiza Status, Cliente, Telefone, Data_Venda, Data_Expiracao, QNTD
async function markProfileSold(rowIndex, clientName, clientNumber, planSlots) {
  const name     = clientName  || '';
  const phone    = clientNumber ? cleanNumber(clientNumber) : '';
  const saleDate = todayDate();
  const expDate  = nextMonthLastDay();
  const slotsInt = parseInt(planSlots, 10) || 0;

  if (!rowIndex) {
    console.error('markProfileSold: rowIndex inválido', { rowIndex });
    return;
  }

  await updateSheetCell(rowIndex, 'F', 'indisponivel');
  await updateSheetCell(rowIndex, 'G', name);       // Cliente (nome)
  await updateSheetCell(rowIndex, 'H', phone);      // Telefone (separado)
  await updateSheetCell(rowIndex, 'I', saleDate);   // Data_Venda
  await updateSheetCell(rowIndex, 'J', expDate);    // Data_Expiracao
  await updateSheetCell(rowIndex, 'K', slotsInt);   // QNTD
}

async function markProfileAvailable(rowIndex) {
  await updateSheetCell(rowIndex, 'F', 'disponivel');
  await updateSheetCell(rowIndex, 'G', '');  // Cliente
  await updateSheetCell(rowIndex, 'H', '');  // Telefone
  await updateSheetCell(rowIndex, 'I', '');  // Data_Venda
  await updateSheetCell(rowIndex, 'J', '');  // Data_Expiracao
  await updateSheetCell(rowIndex, 'K', '');  // QNTD
}

// ==================== CONSULTAS ====================

// Conta linhas Indisponivel de um email (cada linha = 1 slot ocupado)
function getEmailSlotUsage(rows, email) {
  let used = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowEmail = (row[1] || '').toLowerCase().trim();
    const status = (row[5] || '').toLowerCase();
    if (rowEmail === email.toLowerCase().trim() && isIndisponivel(status)) {
      used += 1;
    }
  }
  return used;
}

// Verifica se cliente já existe na planilha (coluna H = Telefone)
// Só conta como cliente se o status for Vendido/Indisponível — ignora linhas disponíveis
async function checkClientInSheet(clientNumber) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;
  const cleanNum = cleanNumber(clientNumber);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const telefone = row[7] || '';  // H = Telefone
    if (cleanNumber(telefone) === cleanNum && isIndisponivel(row[5])) {
      return {
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        cliente: row[6] || '',
        clienteName: (row[6] || '').trim(),
        telefone: row[7] || '',
        dataVenda: row[8] || '',
        dataExpiracao: row[9] || '',
        qntdPerfis: row[10] || '',
        tipoConta: row[11] || '',
      };
    }
  }
  return null;
}

// ── Encontra cliente pelo nome (para migração / clientes sem número) ──
// Procura na coluna G por entradas com nome semelhante ao fornecido.
async function findClientByName(name) {
  if (!name || name.length < 2) return null;
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;
  const nameLower = name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!isIndisponivel(row[5])) continue;
    const clienteNome = (row[6] || '').trim();
    if (!clienteNome) continue;

    const clienteNomeLower = clienteNome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const temTelefone = !!(row[7] && /\d{9,}/.test(String(row[7])));  // H = Telefone

    // Corresponde por nome — ignora se já tem telefone
    if (!temTelefone && (clienteNomeLower.includes(nameLower) || nameLower.includes(clienteNomeLower))) {
      return {
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        cliente: row[6] || '',
        clienteName: clienteNome,
        telefone: row[7] || '',
        dataVenda: row[8] || '',
        dataExpiracao: row[9] || '',
        qntdPerfis: row[10] || '',
        tipoConta: row[11] || '',
      };
    }
  }
  return null;
}

// Actualiza o campo Telefone (coluna H) para associar número ao registo
// e garante que o nome em G está correcto
async function updateClientPhone(rowIndex, clienteName, phone) {
  await updateSheetCell(rowIndex, 'G', clienteName);
  return updateSheetCell(rowIndex, 'H', phone);
}

// Encontra perfil disponível com slots suficientes
// profileType: 'full_account' | 'shared_profile' | undefined (backward-compatible)
async function findAvailableProfile(plataforma, slotsNeeded, profileType) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;

  // Pré-computar total de linhas por email (para o limite dinâmico de slots)
  const emailTotals = {};
  for (let j = 1; j < rows.length; j++) {
    const rEmail = (rows[j][1] || '').toLowerCase().trim();
    const rPlat  = normalizePlataforma(rows[j][0]);
    const rType  = (rows[j][11] || '').toLowerCase().trim() || 'shared_profile';
    if (!rPlat.includes(normalizePlataforma(plataforma))) continue;
    if (rType !== 'shared_profile') continue;
    emailTotals[rEmail] = (emailTotals[rEmail] || 0) + 1;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowPlat   = normalizePlataforma(row[0]);
    const status    = (row[5] || '').toLowerCase();
    const email     = (row[1] || '');
    const tipoConta = (row[11] || '').toLowerCase().trim();  // L = Tipo_Conta
    const rowType   = tipoConta || 'shared_profile';

    if (!rowPlat.includes(normalizePlataforma(plataforma)) || !isDisponivel(status)) continue;

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
        slotsFree: 1,
      };
    } else {
      // shared_profile: limite dinâmico = total de linhas do email (não hardcoded 5)
      const used  = getEmailSlotUsage(rows, email);
      const limit = emailTotals[email.toLowerCase().trim()] || 5;
      const free  = limit - used;
      if (free >= slotsNeeded) {
        return {
          rowIndex: i + 1,
          plataforma: row[0] || '',
          email: email,
          senha: row[2] || '',
          nomePerfil: row[3] || '',
          pin: row[4] || '',
          slotsUsed: used,
          slotsFree: free,
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
      const rowPlat   = normalizePlataforma(row[0]);
      const status    = (row[5] || '').toLowerCase();
      const tipoConta = (row[11] || '').toLowerCase().trim();  // L = Tipo_Conta
      const rowType   = tipoConta || 'shared_profile';
      if (!rowPlat.includes(normalizePlataforma(plataforma)) || !isDisponivel(status)) continue;
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
    const rowPlat   = normalizePlataforma(row[0]);
    const status    = (row[5] || '').toLowerCase();
    const email     = (row[1] || '').trim();
    const tipoConta = (row[11] || '').toLowerCase().trim();  // L = Tipo_Conta
    const rowType   = tipoConta || 'shared_profile';

    if (!rowPlat.includes(normalizePlataforma(plataforma))) continue;
    if (rowType !== 'shared_profile') continue;

    const emailKey = email.toLowerCase();
    if (!emailGroups[emailKey]) {
      emailGroups[emailKey] = { email, availableRows: [], totalCount: 0 };
    }
    emailGroups[emailKey].totalCount++;  // total de linhas (disponivel + indisponivel)
    if (isDisponivel(status)) {
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
  const collected = [];
  for (const emailKey of Object.keys(emailGroups)) {
    const group = emailGroups[emailKey];
    if (group.availableRows.length === 0) continue;
    const used    = getEmailSlotUsage(rows, group.email);
    const free    = group.totalCount - used;  // limite dinâmico, não hardcoded 5
    const canTake = Math.min(group.availableRows.length, free);
    if (canTake <= 0) continue;
    const needed = slotsNeeded - collected.length;
    const take   = Math.min(canTake, needed);
    collected.push(...group.availableRows.slice(0, take));
    if (collected.length >= slotsNeeded) return collected;
  }
  return null;
}

// Encontra todos os perfis existentes de um cliente (para renovações)
// Pesquisa pela coluna H (Telefone)
async function findClientProfiles(clientNumber) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return null;
  const cleanNum = cleanNumber(clientNumber);
  const profiles = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const telefone = row[7] || '';  // H = Telefone
    if (cleanNumber(telefone) === cleanNum) {
      profiles.push({
        rowIndex: i + 1,
        plataforma: row[0] || '',
        email: row[1] || '',
        senha: row[2] || '',
        nomePerfil: row[3] || '',
        pin: row[4] || '',
        status: row[5] || '',
        cliente: row[6] || '',
        telefone: row[7] || '',
        dataVenda: row[8] || '',
        dataExpiracao: row[9] || '',
        qntdPerfis: row[10] || '',
        tipoConta: row[11] || '',
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
    const row       = rows[i];
    const tipoConta = (row[11] || '').toLowerCase().trim();  // L = Tipo_Conta
    const rowType   = tipoConta || 'shared_profile';

    if ((row[0] || '').toLowerCase().includes(plataforma.toLowerCase()) &&
        isDisponivel(row[5])) {
      if (!profileType || rowType === profileType) {
        return true;
      }
    }
  }
  return false;
}

// Conta perfis disponiveis para uma plataforma e tipo (para mensagem de stock insuficiente)
async function countAvailableProfiles(plataforma, profileType) {
  const rows = await fetchAllRows();
  if (rows.length <= 1) return 0;

  if (profileType === 'full_account') {
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const row       = rows[i];
      const rowPlat   = normalizePlataforma(row[0]);
      const status    = (row[5] || '').toLowerCase();
      const tipoConta = (row[11] || '').toLowerCase().trim();  // L = Tipo_Conta
      const rowType   = tipoConta || 'shared_profile';
      if (!rowPlat.includes(normalizePlataforma(plataforma)) || !isDisponivel(status)) continue;
      if (rowType !== 'full_account') continue;
      count++;
    }
    return count;
  }

  // shared_profile: contar slots livres considerando limite de 5 por email
  const emailGroups = {};
  for (let i = 1; i < rows.length; i++) {
    const row       = rows[i];
    const rowPlat   = normalizePlataforma(row[0]);
    const status    = (row[5] || '').toLowerCase();
    const email     = (row[1] || '').trim();
    const tipoConta = (row[11] || '').toLowerCase().trim();  // L = Tipo_Conta
    const rowType   = tipoConta || 'shared_profile';
    if (!rowPlat.includes(normalizePlataforma(plataforma))) continue;
    if (rowType !== 'shared_profile') continue;
    const emailKey = email.toLowerCase();
    if (!emailGroups[emailKey]) emailGroups[emailKey] = { email, availCount: 0, totalCount: 0 };
    emailGroups[emailKey].totalCount++;  // todas as linhas (disponivel + indisponivel)
    if (isDisponivel(status)) emailGroups[emailKey].availCount++;
  }

  let total = 0;
  for (const emailKey of Object.keys(emailGroups)) {
    const group   = emailGroups[emailKey];
    if (group.availCount === 0) continue;
    const used    = getEmailSlotUsage(rows, group.email);
    const free    = group.totalCount - used;  // limite dinâmico, não hardcoded 5
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
          new Date(sale.timestamp).toLocaleString('pt-PT'),
        ]],
      },
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
  nextMonthLastDay,
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
  isDisponivel,
  isIndisponivel,
  normalizePlataforma,
  findClientByName,
  updateClientPhone,
};
