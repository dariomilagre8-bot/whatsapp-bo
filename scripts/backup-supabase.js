/**
 * Backup diário Supabase — clientes, vendas, perfis_entregues
 * Uso: node scripts/backup-supabase.js
 * Em falha: envia alerta WhatsApp ao BOSS_NUMBER (só quando executado como script)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 7;

function dataHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function enviarAlertaWhatsApp(mensagem) {
  const BOSS_NUMBER = process.env.BOSS_NUMBER || process.env.SUPERVISOR_NUMBER || '';
  if (!BOSS_NUMBER || !process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || !process.env.EVOLUTION_INSTANCE_NAME) {
    console.warn('[Backup] Alerta WhatsApp não enviado: faltam BOSS_NUMBER ou Evolution API');
    return;
  }
  try {
    const clean = String(BOSS_NUMBER).replace(/\D/g, '');
    const number = clean + '@s.whatsapp.net';
    const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`;
    const httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });
    await axios.post(url, { number, text: mensagem, delay: 1200 }, {
      headers: { apikey: process.env.EVOLUTION_API_KEY },
      httpsAgent,
    });
    console.log('[Backup] Alerta enviado ao supervisor.');
  } catch (e) {
    console.error('[Backup] Falha ao enviar alerta WhatsApp:', e.message);
  }
}

/**
 * Executa backup e grava em backups/backup-YYYY-MM-DD.json.
 * Retorna { data, totais }. Em falha, lança erro.
 */
async function runBackup() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_KEY em falta');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const data = dataHoje();
  const totais = { clientes: 0, vendas: 0, perfis_entregues: 0 };
  const tabelas = {};

  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  for (const nome of ['clientes', 'vendas', 'perfis_entregues']) {
    try {
      const { data: rows, error } = await supabase.from(nome).select('*');
      if (error) {
        console.warn(`[Backup] Tabela ${nome} não acessível:`, error.message);
        tabelas[nome] = [];
      } else {
        tabelas[nome] = rows || [];
        totais[nome] = (rows || []).length;
      }
    } catch (e) {
      console.warn(`[Backup] Tabela ${nome}:`, e.message);
      tabelas[nome] = [];
    }
  }

  const payload = { data, tabelas, totais: { ...totais } };
  const ficheiro = path.join(BACKUPS_DIR, `backup-${data}.json`);
  fs.writeFileSync(ficheiro, JSON.stringify(payload, null, 2), 'utf8');

  const ficheiros = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime);

  while (ficheiros.length > MAX_BACKUPS) {
    const remover = ficheiros.pop();
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, remover.name));
      console.log('[Backup] Removido antigo:', remover.name);
    } catch (_) {}
  }

  return { data, totais };
}

async function run() {
  try {
    const { data, totais } = await runBackup();
    console.log(`Backup OK: ${totais.clientes} clientes, ${totais.vendas} vendas, ${totais.perfis_entregues} perfis — ${data}`);
    process.exit(0);
  } catch (err) {
    const msg = err.message || String(err);
    console.error('[Backup] Falha:', msg);
    await enviarAlertaWhatsApp(
      `⚠️ ALERTA BACKUP — O backup diário falhou!\nErro: ${msg}\nCorre manualmente: node scripts/backup-supabase.js\nOu via dashboard: GET /api/admin/backup?secret=ADMIN_SECRET`
    );
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = { runBackup, enviarAlertaWhatsApp };
