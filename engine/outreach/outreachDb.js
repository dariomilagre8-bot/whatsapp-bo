// engine/outreach/outreachDb.js — Supabase pa_outreach_log (CLI outreach)

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
}

function getClient() {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Definir SUPABASE_URL e SUPABASE_KEY (ou SUPABASE_SERVICE_KEY) no .env');
  return createClient(url, key);
}

async function fetchLatestByLead(sb, leadName) {
  const { data, error } = await sb
    .from('pa_outreach_log')
    .select('*')
    .eq('lead_name', leadName)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

async function insertPrepared(row) {
  const sb = getClient();
  const { data, error } = await sb.from('pa_outreach_log').insert(row).select('id').maybeSingle();
  if (error) throw error;
  return data;
}

async function markSent(leadName) {
  const sb = getClient();
  const row = await fetchLatestByLead(sb, leadName);
  if (!row) throw new Error(`Lead não encontrado: ${leadName}`);
  if (row.status !== 'prepared') throw new Error(`Último registo não está prepared (status=${row.status})`);
  const patch = { status: 'sent', sent_at: new Date().toISOString() };
  const { error } = await sb.from('pa_outreach_log').update(patch).eq('id', row.id);
  if (error) throw error;
  return row.id;
}

async function markReplied(leadName, responseText) {
  const sb = getClient();
  const row = await fetchLatestByLead(sb, leadName);
  if (!row) throw new Error(`Lead não encontrado: ${leadName}`);
  if (row.status !== 'sent') throw new Error(`Marcar replied só com último status=sent (actual=${row.status})`);
  const patch = { status: 'replied', response_text: responseText || '' };
  const { error } = await sb.from('pa_outreach_log').update(patch).eq('id', row.id);
  if (error) throw error;
  return row.id;
}

async function listAll() {
  const sb = getClient();
  const { data, error } = await sb.from('pa_outreach_log').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

module.exports = {
  getClient,
  insertPrepared,
  markSent,
  markReplied,
  listAll,
  fetchLatestByLead,
};
