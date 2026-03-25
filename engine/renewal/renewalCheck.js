// engine/renewal/renewalCheck.js — Consultas pa_clients (Supabase)

'use strict';

const supabase = require('../lib/supabase');
const { matchesRenewalOffset } = require('./renewalDates');

const DEFAULT_SKIP = '244941713216';

function skipPhonesSet() {
  // Definido no .env como vazio => nenhum skip (útil para testes). Só omissão usa o default.
  const raw =
    process.env.RENEWAL_SKIP_PHONE !== undefined
      ? String(process.env.RENEWAL_SKIP_PHONE)
      : DEFAULT_SKIP;
  return new Set(
    String(raw)
      .split(',')
      .map((s) => s.replace(/\D/g, ''))
      .filter(Boolean)
  );
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

function filterSkips(rows) {
  const skip = skipPhonesSet();
  return (rows || []).filter((r) => r && r.phone && !skip.has(normalizePhone(r.phone)));
}

async function fetchActiveClients() {
  const { data, error } = await supabase.from('pa_clients').select('*').eq('status', 'active');
  if (error) throw error;
  return filterSkips(data || []);
}

async function getClientsForRenewal(daysBeforeExpiry) {
  const rows = await fetchActiveClients();
  return rows.filter((r) => r.expiry_date && matchesRenewalOffset(r.expiry_date, daysBeforeExpiry));
}

async function getExpiredClients() {
  const rows = await fetchActiveClients();
  const now = Date.now();
  return rows.filter((r) => r.expiry_date && new Date(r.expiry_date).getTime() < now);
}

async function markClientStatus(phone, newStatus) {
  const normalized = normalizePhone(phone);
  const { error } = await supabase
    .from('pa_clients')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('phone', normalized);
  if (error) throw error;
  return true;
}

module.exports = {
  getClientsForRenewal,
  getExpiredClients,
  markClientStatus,
  normalizePhone,
  filterSkips,
  fetchActiveClients,
};
