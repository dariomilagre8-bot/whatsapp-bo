// engine/outreach/cli.js — preparação manual de outreach (NUNCA enviar WhatsApp daqui)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { renderMessage, NICHE_KEYS } = require('./messageTemplates');
const { getFollowUp } = require('./followUpSequence');

function parseArgs(argv) {
  const o = { cmd: null, lead: null, niche: null, pessoa: null, template: 'A', phone: null, servico: '', response: '' };
  for (const a of argv) {
    if (a === '--prepare') o.cmd = 'prepare';
    else if (a === '--sent') o.cmd = 'sent';
    else if (a === '--replied') o.cmd = 'replied';
    else if (a === '--status') o.cmd = 'status';
    else if (a === '--followups') o.cmd = 'followups';
    else if (a.startsWith('--lead=')) o.lead = a.slice(7).replace(/^"|"$/g, '');
    else if (a.startsWith('--niche=')) o.niche = a.slice(8).toLowerCase();
    else if (a.startsWith('--pessoa=')) o.pessoa = a.slice(9).replace(/^"|"$/g, '');
    else if (a.startsWith('--template=')) o.template = a.slice(11).toUpperCase();
    else if (a.startsWith('--phone=')) o.phone = a.slice(8).replace(/^"|"$/g, '');
    else if (a.startsWith('--servico=')) o.servico = a.slice(10).replace(/^"|"$/g, '');
    else if (a.startsWith('--response=')) o.response = a.slice(11).replace(/^"|"$/g, '');
  }
  return o;
}

function readMeta(notes) {
  try {
    const j = JSON.parse(notes || '{}');
    return { nome_pessoa: j.nome_pessoa || '' };
  } catch (_) {
    return { nome_pessoa: '' };
  }
}

function wholeDaysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function nextHint(row) {
  if (row.status === 'prepared') return 'colar mensagem inicial (prepared)';
  if (row.status !== 'sent' || !row.sent_at) return '—';
  const d = wholeDaysSince(row.sent_at);
  if (d == null) return '—';
  if (d > 7) return 'marcar status=dead';
  if (d >= 7 && !row.follow_up_2_at) return 'follow-up dia 7';
  if (d >= 2 && !row.follow_up_1_at) return 'follow-up dia 2';
  return 'aguardar / concluído';
}

function buildPrepareInsert(args) {
  if (!args.lead || !args.niche || !args.pessoa) {
    throw new Error('--prepare requer --lead=, --niche=, --pessoa=');
  }
  if (!NICHE_KEYS.includes(args.niche)) throw new Error(`--niche inválido. Use: ${NICHE_KEYS.join(', ')}`);
  if (args.niche === 'generico' && !String(args.servico || '').trim()) {
    throw new Error('Nicho generico requer --servico=');
  }
  const tv = String(args.template || 'A').trim().toUpperCase();
  if (!['A', 'B', 'C'].includes(tv)) throw new Error('--template deve ser A, B ou C');
  const message_text = renderMessage(args.niche, tv, {
    nome_pessoa: args.pessoa,
    nome_empresa: args.lead,
    servico_principal: args.servico || '',
  });
  return {
    lead_name: args.lead,
    lead_phone: args.phone || null,
    lead_niche: args.niche,
    template_used: tv,
    message_text,
    status: 'prepared',
    notes: JSON.stringify({ nome_pessoa: args.pessoa || '' }),
  };
}

async function run(argv, db) {
  const deps = db || require('./outreachDb');
  const args = parseArgs(argv);
  if (args.cmd === 'prepare') {
    const row = buildPrepareInsert(args);
    await deps.insertPrepared(row);
    console.log('\n--- Mensagem (copiar manualmente para o WhatsApp) ---\n');
    console.log(row.message_text);
    console.log('\n--- Fim ---\n');
    console.log('Registado em pa_outreach_log como status=prepared. Envio: sempre manual.');
    return;
  }
  if (args.cmd === 'sent') {
    if (!args.lead) throw new Error('--sent requer --lead=');
    await deps.markSent(args.lead);
    console.log(`OK: último registo de "${args.lead}" → status=sent, sent_at=agora`);
    return;
  }
  if (args.cmd === 'replied') {
    if (!args.lead) throw new Error('--replied requer --lead=');
    await deps.markReplied(args.lead, args.response);
    console.log(`OK: último registo sent de "${args.lead}" → status=replied`);
    return;
  }
  if (args.cmd === 'status') {
    const rows = await deps.listAll();
    console.log('lead_name | status | dias_desde_envio | próximo_passo');
    for (const r of rows) {
      const d = r.sent_at ? wholeDaysSince(r.sent_at) : '—';
      console.log(`${r.lead_name} | ${r.status} | ${d} | ${nextHint(r)}`);
    }
    return;
  }
  if (args.cmd === 'followups') {
    const rows = await deps.listAll();
    const due = rows.filter((r) => r.status === 'sent' && r.sent_at);
    console.log('Leads com follow-up sugerido HOJE (copiar mensagem manualmente):\n');
    let n = 0;
    for (const r of due) {
      const d = wholeDaysSince(r.sent_at);
      const meta = readMeta(r.notes);
      const vars = { nome_pessoa: meta.nome_pessoa || '(nome)', nome_empresa: r.lead_name };
      let show = false;
      let label = '';
      if (d > 7) {
        show = true;
        label = 'OVERDUE — marcar dead no Supabase ou ajustar status';
      } else if (d === 7 && !r.follow_up_2_at) {
        show = true;
        label = 'Dia 7 (última tentativa)';
      } else if (d === 2 && !r.follow_up_1_at) {
        show = true;
        label = 'Dia 2';
      }
      if (!show) continue;
      n++;
      const fu = getFollowUp(r.id, d, vars);
      console.log(`\n# ${r.lead_name} — ${label} (dias desde envio inicial: ${d})`);
      if (fu.message) console.log(fu.message);
      else console.log('(sem texto automático — rever status)');
      console.log('Após colar no WhatsApp, actualize follow_up_1_at / follow_up_2_at na linha do Supabase se quiser evitar repetir.');
    }
    if (!n) console.log('Nenhum follow-up pendente pelos critérios actuais.');
    return;
  }
  throw new Error('Use: --prepare | --sent | --replied | --status | --followups (ver engine/outreach/cli.js)');
}

module.exports = { run, parseArgs, buildPrepareInsert };
