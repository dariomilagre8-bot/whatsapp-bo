/**
 * Backup das variáveis de ambiente relevantes (segredos).
 * Uso: node scripts/backup-env.js
 * Guarda em backups/env-backup-YYYY-MM-DD.json
 * ATENÇÃO: Ficheiro contém segredos — backups/ deve estar no .gitignore
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const PREFIXOS = [
  'SUPABASE_',
  'EVOLUTION_',
  'ADMIN_',
  'BOSS_',
  'PHONE_',
  'BRAND_',
  'PRECO_',
  'BREVO_',
  'SENTRY_',
  'GOOGLE_SHEET_ID',
  'INSTANCE_NAME',
  'GEMINI_',
  'SHEET_NAME',
  'DIAS_',
];

const EXCLUIR_KEYS = new Set(['NODE_ENV', 'PATH', 'HOME', 'USER', 'PWD', 'SHELL', 'LANG', 'TERM']);
const EXCLUIR_PREFIXOS = ['npm_', 'NODE_'];

function dataHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function run() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (EXCLUIR_KEYS.has(k) || EXCLUIR_PREFIXOS.some(p => k.startsWith(p))) continue;
    const incluir = PREFIXOS.some(p => k === p || k.startsWith(p));
    if (incluir && v !== undefined && v !== '') env[k] = v;
  }

  const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const data = dataHoje();
  const ficheiro = path.join(BACKUPS_DIR, `env-backup-${data}.json`);
  const payload = { data, env, keys: Object.keys(env).length };
  fs.writeFileSync(ficheiro, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[Backup ENV] Guardado em ${ficheiro} (${payload.keys} variáveis)`);
}

run();
