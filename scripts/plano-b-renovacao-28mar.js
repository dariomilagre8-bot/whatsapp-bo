#!/usr/bin/env node
// scripts/plano-b-renovacao-28mar.js
// PLANO B — Renovação manual dos clientes StreamZone que expiram 31 Mar
// Uso: node scripts/plano-b-renovacao-28mar.js [--dry-run] [--telefone 244XXXXXXXXX]
// Flags:
//   --dry-run      Simula sem enviar mensagens
//   --telefone X   Envia só para esse número (teste individual)

require('dotenv').config();

const SLEEP_MS = 4000; // 4s entre mensagens (abaixo do rate limit da Evolution)
const TARGET_DATE = '31/03/2026';
const TARGET_DATE_HUMAN = '31 de Março de 2026';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
const SINGLE_PHONE = (() => {
  const idx = args.indexOf('--telefone');
  return idx !== -1 ? args[idx + 1] : null;
})();

if (DRY_RUN) {
  console.log('\n🔵 MODO DRY RUN — nenhuma mensagem será enviada\n');
} else {
  console.log('\n🔴 MODO REAL — mensagens SERÃO enviadas\n');
}

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ── Config Google Sheets ──
const SHEET_ID = process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEET_ID;
const CRED_PATH = path.join(__dirname, '..', 'credentials.json');
const SHEET_NAME = 'Página1';

// ── Coluna indices (0-based) ──
const COLS = {
  platform: 0,
  email: 1,
  status: 5,
  cliente: 6,
  telefone: 7,
  dataExpiracao: 9,
  plano: 12,
  valor: 13,
};

// ── Config Evolution API ──
const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME;
const PAYMENT_IBAN = '0040.0000.7685.3192.1018.3';
const PAYMENT_MCX = '946014060';
const PAYMENT_TITULAR = 'Braulio Manuel';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizeText(t) {
  return t ? t.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
}

function parseDataExpiracao(str) {
  if (!str || !String(str).trim()) return null;
  const s = String(str).trim();
  const slash = s.split('/');
  const dash = s.split('-');
  if (slash.length === 3) {
    const d = parseInt(slash[0], 10);
    const m = parseInt(slash[1], 10) - 1;
    const y = parseInt(slash[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
  }
  if (dash.length === 3) {
    const y = parseInt(dash[0], 10);
    const m = parseInt(dash[1], 10) - 1;
    const d = parseInt(dash[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
  }
  return null;
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '').trim();
}

function buildMensagem(cliente, plataforma, plano, valor, diasRestantes) {
  const saudacao = `Olá ${cliente || 'Cliente'}! 😊`;
  if (diasRestantes > 1) {
    return (
      `${saudacao} A sua conta *${plataforma || 'Netflix'}* (${plano || 'Plano'}) expira no dia *${TARGET_DATE_HUMAN}*.\n\n` +
      `Para continuar sem interrupção, basta renovar o pagamento de *${valor || '—'} Kz*.\n\n` +
      `*Dados de pagamento:*\n` +
      `• Transferência — IBAN: ${PAYMENT_IBAN} (${PAYMENT_TITULAR})\n` +
      `• Multicaixa Express: ${PAYMENT_MCX}\n\n` +
      `Após o pagamento, envie o comprovativo por aqui! 🙏`
    );
  } else if (diasRestantes === 0) {
    return (
      `${saudacao} A sua conta *${plataforma || 'Netflix'}* expira *hoje*.\n\n` +
      `Se quiser continuar, confirme o pagamento de *${valor || '—'} Kz* e envie o comprovativo. Obrigado! 🤝`
    );
  } else {
    return (
      `${saudacao} A sua conta *${plataforma || 'Netflix'}* expirou. Se ainda quiser renovar, ` +
      `tem 48h para regularizar o pagamento de *${valor || '—'} Kz*. Depois o perfil será atribuído a outro cliente. 🙏`
    );
  }
}

async function sendWhatsApp(phone, text) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] → ${phone}`);
    console.log(`  "${text.substring(0, 100)}..."`);
    return true;
  }
  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    body: JSON.stringify({ number: jid, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.substring(0, 100)}`);
  }
  return true;
}

async function main() {
  console.log('=================================================');
  console.log('  PLANO B — RENOVAÇÃO MANUAL StreamZone 28 Mar');
  console.log('=================================================\n');

  if (!SHEET_ID) {
    console.error('❌ GOOGLE_SHEET_ID não configurado no .env');
    process.exit(1);
  }
  if (!fs.existsSync(CRED_PATH)) {
    console.error('❌ credentials.json não encontrado em:', CRED_PATH);
    process.exit(1);
  }
  if (!DRY_RUN) {
    if (!EVOLUTION_URL || !EVOLUTION_KEY || !EVOLUTION_INSTANCE) {
      console.error('❌ EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE não configurados');
      process.exit(1);
    }
    console.log(`📡 Instância Evolution: ${EVOLUTION_INSTANCE}`);
  }

  // ── Inicializar Google Sheets ──
  const auth = new google.auth.GoogleAuth({
    keyFile: CRED_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`📊 A ler planilha: ${SHEET_ID} (aba: ${SHEET_NAME})`);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:O`,
  });

  const rows = res.data.values || [];
  console.log(`   ${rows.length - 1} linhas encontradas\n`);

  const cell = (row, idx) => (row[idx] != null ? String(row[idx]).trim() : '');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const clientes = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = normalizeText(cell(row, COLS.status));
    if (!['indisponivel', 'vendido', 'a_verificar'].includes(status)) continue;

    const dataExp = parseDataExpiracao(cell(row, COLS.dataExpiracao));
    if (!dataExp) continue;

    const expDate = new Date(dataExp);
    expDate.setHours(0, 0, 0, 0);
    const diffDias = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    // Filtrar: apenas clientes que expiram entre -3 e +3 dias (janela de renovação)
    if (diffDias < -3 || diffDias > 3) continue;

    const telefone = normalizePhone(cell(row, COLS.telefone));
    if (!telefone) continue;
    if (SINGLE_PHONE && telefone !== normalizePhone(SINGLE_PHONE)) continue;

    const plataforma = cell(row, COLS.platform) || 'Netflix';
    const clienteNome = cell(row, COLS.cliente) || 'Cliente';
    const plano = cell(row, COLS.plano) || 'Plano';
    const valor = cell(row, COLS.valor) || '5000';

    clientes.push({
      sheetRow: i + 1,
      telefone,
      clienteNome,
      plataforma,
      plano,
      valor,
      dataExp: cell(row, COLS.dataExpiracao),
      diffDias,
      status,
    });
  }

  if (clientes.length === 0) {
    console.log('⚠️  Nenhum cliente na janela de renovação (±3 dias da data de expiração).');
    console.log('   Verifique se a planilha tem dados em Data_Expiracao (coluna J).');
    return;
  }

  console.log(`📋 ${clientes.length} cliente(s) para notificar:\n`);
  console.log('Nº  | Cliente                  | Telefone      | Plataforma  | Plano        | Valor    | Expira      | Dias');
  console.log('----|--------------------------|---------------|-------------|--------------|----------|-------------|------');
  for (const c of clientes) {
    const dias = c.diffDias > 0 ? `+${c.diffDias}` : String(c.diffDias);
    console.log(
      `${String(clientes.indexOf(c) + 1).padStart(3)} | ` +
      `${c.clienteNome.padEnd(24)} | ` +
      `${c.telefone.padEnd(13)} | ` +
      `${c.plataforma.padEnd(11)} | ` +
      `${c.plano.padEnd(12)} | ` +
      `${String(c.valor + ' Kz').padEnd(8)} | ` +
      `${c.dataExp.padEnd(11)} | ` +
      `${dias}`
    );
  }
  console.log('');

  if (!DRY_RUN) {
    console.log('⚠️  A enviar mensagens REAIS em 5 segundos... Ctrl+C para cancelar.\n');
    await sleep(5000);
  }

  let enviados = 0;
  let erros = 0;

  for (const c of clientes) {
    const msg = buildMensagem(c.clienteNome, c.plataforma, c.plano, c.valor, c.diffDias);
    console.log(`\n[${enviados + erros + 1}/${clientes.length}] ${c.clienteNome} (${c.telefone})`);
    try {
      await sendWhatsApp(c.telefone, msg);
      enviados++;
      console.log(`  ✅ Enviado`);
    } catch (err) {
      erros++;
      console.error(`  ❌ Erro: ${err.message}`);
    }
    if (clientes.indexOf(c) < clientes.length - 1) await sleep(SLEEP_MS);
  }

  console.log('\n=================================================');
  console.log(`RESULTADO: ${enviados} enviados | ${erros} erros`);
  if (DRY_RUN) console.log('(DRY RUN — nenhuma mensagem real enviada)');
  console.log('=================================================\n');
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
