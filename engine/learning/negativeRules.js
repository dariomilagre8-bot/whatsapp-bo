// engine/learning/negativeRules.js — cache em memória, refresh 5 min, Supabase pa_negative_rules

'use strict';

const supabase = require('../lib/supabase');

const REFRESH_MS = 5 * 60 * 1000;
let cache = [];
let refreshTimer = null;

async function fetchRows() {
  let builder;
  try {
    builder = supabase.from('pa_negative_rules');
  } catch {
    cache = [];
    return;
  }
  const { data, error } = await builder.select('*').eq('active', true);
  if (error) throw error;
  cache = Array.isArray(data) ? data : [];
}

async function loadNegativeRules() {
  await fetchRows();
}

function matchNegativeRule(userMessage, clientId) {
  const text = String(userMessage || '').toLowerCase();
  if (!text) return null;
  const slug = clientId || '';
  for (const r of cache) {
    if (!r || r.input_pattern == null) continue;
    if (r.client_id != null && String(r.client_id) !== '' && r.client_id !== slug) continue;
    const p = String(r.input_pattern).toLowerCase();
    if (p && text.includes(p)) return r;
  }
  return null;
}

async function addNegativeRule(clientId, rule) {
  const row = {
    client_id: clientId || null,
    input_pattern: rule.input_pattern,
    wrong_intent: rule.wrong_intent,
    correct_intent: rule.correct_intent,
    bug_id: rule.bug_id || null,
    active: true,
  };
  let ins;
  try {
    ins = supabase.from('pa_negative_rules');
  } catch (e) {
    throw new Error(`[negative-rules] Supabase indisponível: ${e.message}`);
  }
  const { data, error } = await ins.insert(row).select('id').single();
  if (error) throw error;
  await fetchRows();
  return data;
}

function getTopRulesForPrompt(limit = 20) {
  return [...cache]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

function formatNegativeRulesSection(rules) {
  if (!rules || !rules.length) return '';
  const body = rules
    .map(
      (r) =>
        `- NUNCA classifiques '${r.input_pattern}' como ${r.wrong_intent}. Classificação correcta: ${r.correct_intent}.`
    )
    .join('\n');
  return `## Regras Negativas (auto-actualizadas)\n${body}\n\n`;
}

function startNegativeRulesRefresh() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    fetchRows().catch((e) => console.warn('[negative-rules] refresh:', e.message));
  }, REFRESH_MS);
}

module.exports = {
  loadNegativeRules,
  matchNegativeRule,
  addNegativeRule,
  getTopRulesForPrompt,
  formatNegativeRulesSection,
  startNegativeRulesRefresh,
  _testSetCache: (rows) => {
    cache = rows || [];
  },
};
