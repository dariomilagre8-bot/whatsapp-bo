/**
 * Popula a Google Sheet de teste com perfis fictícios.
 * Uso: node scripts/setup-test-sheet.js
 *
 * ANTES de executar:
 * 1. Duplicar a Google Sheet de produção da SDB
 * 2. Renomear para "SDB-Teste"
 * 3. Limpar todos os dados (manter apenas o cabeçalho)
 * 4. Copiar o ID da nova sheet para .env.test (GOOGLE_SHEET_ID=...)
 * 5. Partilhar a nova sheet com o email da service account (em credentials.json)
 */
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

async function setup() {
  console.log('📊 A configurar Google Sheet de teste...');

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId || sheetId === '__NOVO_SHEET_ID__') {
    console.error('❌ Erro: GOOGLE_SHEET_ID não configurado em .env.test');
    console.error('   1. Duplica a Google Sheet de produção');
    console.error('   2. Copia o ID para .env.test (GOOGLE_SHEET_ID=...)');
    process.exit(1);
  }

  let credentials;
  if (process.env.GOOGLE_CREDENTIALS) {
    credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS, 'base64').toString()
    );
  } else {
    // Fallback: ler credentials.json directamente (desenvolvimento local)
    const credsPath = path.join(__dirname, '..', 'credentials.json');
    if (!fs.existsSync(credsPath)) {
      console.error('❌ Erro: GOOGLE_CREDENTIALS não definido e credentials.json não encontrado');
      process.exit(1);
    }
    credentials = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Perfis de teste fictícios
  const testData = [
    // Cabeçalho (igual ao de produção)
    ['Plataforma', 'Email', 'Senha', 'NomePerfil', 'PIN', 'Status', 'Cliente', 'Data_Venda', 'QNTD', 'Tipo_Conta'],
    // 3 perfis Netflix disponíveis
    ['Netflix', 'teste.netflix1@gmail.com', 'Teste123!', 'Perfil_Teste_1', '1234', 'disponivel', '', '', '', 'shared_profile'],
    ['Netflix', 'teste.netflix2@gmail.com', 'Teste456!', 'Perfil_Teste_2', '5678', 'disponivel', '', '', '', 'shared_profile'],
    ['Netflix', 'teste.netflix3@gmail.com', 'Teste789!', 'Perfil_Teste_3', '9012', 'disponivel', '', '', '', 'shared_profile'],
    // 3 perfis Prime Video disponíveis
    ['Prime Video', 'teste.prime1@gmail.com', 'Prime123!', 'Perfil_Prime_1', '1111', 'disponivel', '', '', '', 'shared_profile'],
    ['Prime Video', 'teste.prime2@gmail.com', 'Prime456!', 'Perfil_Prime_2', '2222', 'disponivel', '', '', '', 'shared_profile'],
    ['Prime Video', 'teste.prime3@gmail.com', 'Prime789!', 'Perfil_Prime_3', '3333', 'disponivel', '', '', '', 'shared_profile'],
  ];

  try {
    // Limpar sheet e inserir dados de teste
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: 'Sheet1',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: testData },
    });

    console.log('✅ Google Sheet de teste populada com sucesso!');
    console.log('   - 3 perfis Netflix (disponivel)');
    console.log('   - 3 perfis Prime Video (disponivel)');
    console.log(`   - Sheet ID: ${sheetId}`);
    console.log('\n   Próximo passo: npm run create:test-instance');
  } catch (e) {
    console.error('❌ Erro ao actualizar Sheet:', e.message);
    if (e.message.includes('403')) {
      console.error('   → A sheet não está partilhada com a service account.');
      console.error('   → Email da service account está em credentials.json (campo "client_email").');
    }
    process.exit(1);
  }
}

setup().catch(console.error);
