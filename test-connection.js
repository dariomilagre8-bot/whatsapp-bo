/**
 * test-connection.js — Diagnóstico de ligação à Google Sheet
 *
 * Execução local:  node test-connection.js
 * Execução Easypanel: define GOOGLE_CREDENTIALS (base64 do JSON da service account)
 *
 * Variáveis lidas:
 *   GOOGLE_CREDENTIALS  — JSON da service account em base64 (prioritário)
 *   GOOGLE_SHEET_ID     — ID da Sheet (fallback para o ID hardcoded abaixo)
 */

require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const fs   = require('fs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID
  || '1P5N1ulKdnGRfLNjEIShaGNGvD1bJuaXUcNwTn3gNyxc';

async function main() {
  console.log('\n🔍 StreamZone — Diagnóstico de Ligação à Google Sheet');
  console.log(`   Sheet ID : ${SHEET_ID}\n`);

  // ── 1. Autenticação ───────────────────────────────────────────────────────────
  let auth;
  const credsEnv = process.env.GOOGLE_CREDENTIALS;

  if (credsEnv) {
    console.log('   Modo     : GOOGLE_CREDENTIALS (env base64)');
    try {
      const json = Buffer.from(credsEnv, 'base64').toString('utf8');
      const creds = JSON.parse(json);
      auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      if (creds.client_email) {
        console.log(`   Account  : ${creds.client_email}`);
      }
    } catch (e) {
      console.error('❌ GOOGLE_CREDENTIALS inválido — não é JSON base64 válido.');
      console.error('   Fix: base64 do ficheiro credentials.json completo.');
      process.exit(1);
    }
  } else {
    // Fallback: ficheiro local credentials.json
    const credsFile = path.join(__dirname, 'credentials.json');
    if (!fs.existsSync(credsFile)) {
      console.error('❌ Credenciais não encontradas.');
      console.error('   Fix no Easypanel: adiciona a variável GOOGLE_CREDENTIALS');
      console.error('   com o conteúdo de credentials.json codificado em base64:');
      console.error('   base64 -w 0 credentials.json');
      process.exit(1);
    }
    console.log('   Modo     : credentials.json (ficheiro local)');
    const raw = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    if (raw.client_email) console.log(`   Account  : ${raw.client_email}`);
    auth = new google.auth.GoogleAuth({
      keyFile: credsFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }

  // ── 2. Leitura das primeiras 10 linhas ────────────────────────────────────────
  const sheetsAPI = google.sheets({ version: 'v4', auth });
  let rows;
  try {
    const res = await sheetsAPI.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'A1:N10',
    });
    rows = res.data.values || [];
  } catch (err) {
    const code = err.code || (err.response && err.response.status);
    console.error(`\n❌ Erro ao ler a Sheet (código ${code || 'desconhecido'})`);

    if (code === 403 || String(err.message).includes('403')) {
      let email = '(ver GOOGLE_CREDENTIALS ou credentials.json)';
      try {
        const client = await auth.getClient();
        email = client.email || client._clientEmail || email;
      } catch {}
      console.error('\n   Causa    : Sem permissão de leitura na Sheet.');
      console.error('   Fix      : Partilha a Sheet com este email (Editor ou Leitor):');
      console.error(`              👉 ${email}`);
    } else if (code === 404 || String(err.message).includes('404')) {
      console.error('\n   Causa    : Sheet ID inválido ou Sheet não encontrada.');
      console.error(`   Fix      : Verifica GOOGLE_SHEET_ID (actual: ${SHEET_ID})`);
    } else {
      console.error(`\n   Mensagem : ${err.message}`);
    }
    process.exit(1);
  }

  // ── 3. Resultados ─────────────────────────────────────────────────────────────
  console.log(`\n✅ Ligação estabelecida com sucesso!`);
  console.log(`   Linhas lidas : ${rows.length}`);

  if (rows.length === 0) {
    console.log('   ⚠️  Sheet vazia ou sem dados nas primeiras 10 linhas.');
    process.exit(0);
  }

  // Headers (primeira linha)
  const headers = rows[0];
  console.log(`\n   Headers (linha 1):`);
  headers.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    console.log(`     ${col} [${i}] = "${h}"`);
  });

  // Coluna status (procura case-insensitive)
  const statusIdx = headers.findIndex(h => h.toLowerCase().includes('status'));
  if (statusIdx === -1) {
    console.log('\n   ⚠️  Coluna "status" não encontrada nos headers.');
  } else {
    const statusValues = rows.slice(1)
      .map(r => (r[statusIdx] || '').trim())
      .filter(Boolean);
    const uniqueStatus = [...new Set(statusValues)];
    console.log(`\n   Valores únicos de status (coluna ${headers[statusIdx]}):`);
    uniqueStatus.forEach(v => console.log(`     • "${v}"`));
  }

  console.log('\n   Tudo OK — a Sheet está acessível pelo bot.\n');
}

main().catch(err => {
  console.error('\n❌ Erro inesperado:', err.message);
  process.exit(1);
});
