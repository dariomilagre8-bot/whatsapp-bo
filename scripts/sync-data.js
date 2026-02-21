#!/usr/bin/env node
/**
 * scripts/sync-data.js
 * Tarefas N + A: Sincroniza dados manuais (CSV) → Google Sheet
 *
 * Uso:
 *   node scripts/sync-data.js --csv /caminho/para/migracao_clientes.csv
 *   node scripts/sync-data.js --csv /caminho/para/migracao_clientes.csv --dry-run
 *
 * Flags:
 *   --csv       Caminho para o ficheiro CSV (obrigatório)
 *   --dry-run   Mostra o que seria escrito sem modificar a Sheet
 *   --sheet     Nome da aba da Sheet (default: valor de SHEET_NAME no .env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const csvFlag = args.indexOf('--csv');
const dryRun  = args.includes('--dry-run');
const sheetFlag = args.indexOf('--sheet');

const csvPath    = csvFlag >= 0 ? args[csvFlag + 1] : null;
const sheetName  = sheetFlag >= 0 ? args[sheetFlag + 1] : (process.env.SHEET_NAME || 'Página1');
const SHEET_ID   = process.env.GOOGLE_SHEET_ID;

if (!csvPath) {
  console.error('❌ Obrigatório: --csv <caminho>');
  console.error('   Exemplo: node scripts/sync-data.js --csv ~/Downloads/migracao_clientes.csv');
  process.exit(1);
}
if (!SHEET_ID) {
  console.error('❌ GOOGLE_SHEET_ID não está definido no .env');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`❌ Ficheiro não encontrado: ${csvPath}`);
  process.exit(1);
}

// ── Google Sheets Auth ────────────────────────────────────────────────────────
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, '..', 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheetsAPI = google.sheets({ version: 'v4', auth });

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
    rows.push(obj);
  }
  return rows;
}

function csvRowToSheetRow(row) {
  // CSV cols: Plataforma,Email,Senha,NomePerfil,PIN,Status,Cliente,Data_Venda,QNTD,Tipo_Conta
  // Sheet cols: A=Plataforma B=Email C=Senha D=NomePerfil E=Pin F=Status G=Cliente H=DataVenda I=QNTD J=Tipo
  return [
    row['Plataforma']  || '',
    row['Email']       || '',
    row['Senha']       || '',
    row['NomePerfil']  || '',
    row['PIN']         || '',
    row['Status']      || 'indisponivel',
    row['Cliente']     || '',  // "Nome - Numero" ou só "Nome" se sem número
    row['Data_Venda']  || '',
    row['QNTD']        || '1',
    row['Tipo_Conta']  || 'shared_profile',
  ];
}

async function getExistingRows() {
  const res = await sheetsAPI.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:J`,
  });
  return res.data.values || [];
}

function isDuplicate(existingRows, newRow) {
  // Considera duplicado se mesmo Email + NomePerfil + Cliente
  return existingRows.some(r =>
    (r[1] || '') === newRow[1] &&
    (r[3] || '') === newRow[3] &&
    (r[6] || '').split(' - ')[0].trim() === newRow[6].split(' - ')[0].trim()
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📋 Sync de dados manuais → Google Sheet`);
  console.log(`   CSV: ${csvPath}`);
  console.log(`   Sheet: ${sheetName} (ID: ${SHEET_ID})`);
  console.log(`   Modo: ${dryRun ? '🔍 DRY-RUN (sem alterações)' : '✏️ ESCRITA REAL'}\n`);

  const csvRows = parseCSV(csvPath);
  console.log(`📂 ${csvRows.length} linha(s) encontrada(s) no CSV`);

  const existingRows = await getExistingRows();
  const dataRows = existingRows.slice(1); // Ignorar cabeçalho
  console.log(`📊 ${dataRows.length} linha(s) já existentes na Sheet\n`);

  const toInsert = [];
  const skipped  = [];

  for (const row of csvRows) {
    const sheetRow = csvRowToSheetRow(row);
    if (isDuplicate(dataRows, sheetRow)) {
      skipped.push(sheetRow);
    } else {
      toInsert.push(sheetRow);
    }
  }

  console.log(`✅ ${toInsert.length} linha(s) a inserir`);
  console.log(`⏭️  ${skipped.length} linha(s) já existentes (ignoradas)\n`);

  if (toInsert.length === 0) {
    console.log('Nada a inserir. Sheet já está atualizada!');
    return;
  }

  // Mostrar preview
  console.log('Preview das linhas a inserir:');
  toInsert.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r[0]} | ${r[1]} | ${r[3]} | ${r[6]} | ${r[7]}`);
  });
  console.log('');

  if (dryRun) {
    console.log('🔍 DRY-RUN: nenhuma alteração foi feita.');
    return;
  }

  // Confirmar antes de escrever
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question(`Confirmas a inserção de ${toInsert.length} linha(s)? (sim/não): `, async (answer) => {
      rl.close();
      if (!['sim', 's', 'yes', 'y'].includes(answer.toLowerCase().trim())) {
        console.log('Operação cancelada.');
        resolve();
        return;
      }

      // Inserir após a última linha preenchida
      await sheetsAPI.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A:J`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: toInsert },
      });

      console.log(`\n✅ ${toInsert.length} linha(s) inserida(s) com sucesso!`);
      console.log(`\n📌 Próximos passos:`);
      console.log(`   1. Verifica a Sheet e confirma os dados`);
      console.log(`   2. Atualiza os números de WhatsApp (coluna G) se não estiverem preenchidos`);
      console.log(`   3. O bot vai associar automaticamente os números quando os clientes contactarem`);
      resolve();
    });
  });
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
