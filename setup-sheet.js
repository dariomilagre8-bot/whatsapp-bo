/**
 * Script único para configurar a planilha Google Sheets:
 * 1. Adicionar header "Tipo_Conta" na coluna J (Página1)
 * 2. Criar aba "VendasPerdidas" com headers
 *
 * Executar: node setup-sheet.js
 */
require('dotenv').config();
const path = require('path');
const { google } = require('googleapis');

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheetsAPI = google.sheets({ version: 'v4', auth });

async function main() {
  // 1. Adicionar header "Tipo_Conta" na coluna J1
  console.log('1️⃣  Adicionando header "Tipo_Conta" em J1...');
  await sheetsAPI.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'Página1!J1',
    valueInputOption: 'RAW',
    requestBody: { values: [['Tipo_Conta']] },
  });
  console.log('   ✅ Header "Tipo_Conta" adicionado em Página1!J1');

  // 2. Criar aba "VendasPerdidas"
  console.log('2️⃣  Criando aba "VendasPerdidas"...');
  try {
    await sheetsAPI.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: 'VendasPerdidas' }
          }
        }]
      }
    });
    console.log('   ✅ Aba "VendasPerdidas" criada');
  } catch (e) {
    if (e.message && e.message.includes('already exists')) {
      console.log('   ⚠️  Aba "VendasPerdidas" já existe, continuando...');
    } else {
      throw e;
    }
  }

  // 3. Adicionar headers na aba VendasPerdidas
  console.log('3️⃣  Adicionando headers na aba "VendasPerdidas"...');
  await sheetsAPI.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'VendasPerdidas!A1:G1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [['ID', 'Telefone', 'Nome', 'Interesses', 'UltimoEstado', 'Motivo', 'DataHora']]
    },
  });
  console.log('   ✅ Headers adicionados na aba "VendasPerdidas"');

  console.log('\n🎉 Setup concluído! Lembre-se de preencher a coluna J nas linhas existentes com "full_account" ou "shared_profile".');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
