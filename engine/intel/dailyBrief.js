// engine/intel/dailyBrief.js — Daily Intelligence Brief (sem LLM)
// Query Supabase pa_daily_insights + Redis queues → texto puro via template string.

'use strict';

const BOTS = [
  { id: 'streamzone', label: 'Zara' },
  { id: 'luna',       label: 'Luna' },
  { id: 'demo',       label: 'Bia'  },
];

const REDIS_QUEUES = ['pa-messages', 'pa-dead-letters'];
const ALERT_SLOW_MS = 5000;

// ── Supabase ──────────────────────────────────────────────────────────────────

async function queryInsights() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let supabase;
  try {
    supabase = require('../lib/supabase');
  } catch (_) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('pa_daily_insights')
      .select('client_id, response_time_ms, llm_success, resolution_type')
      .gte('created_at', since);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[BRIEF] Supabase indisponível:', err.message);
    return null;
  }
}

function aggregateByBot(rows) {
  const map = {};

  for (const bot of BOTS) {
    map[bot.id] = { msgs: 0, totalMs: 0, msCount: 0, llmErrors: 0, escalados: 0, abandoned: 0 };
  }

  for (const row of rows) {
    const key = row.client_id;
    if (!map[key]) map[key] = { msgs: 0, totalMs: 0, msCount: 0, llmErrors: 0, escalados: 0, abandoned: 0 };

    map[key].msgs++;

    if (row.response_time_ms != null) {
      map[key].totalMs += Number(row.response_time_ms);
      map[key].msCount++;
    }
    if (row.llm_success === false) map[key].llmErrors++;
    if (row.resolution_type === 'human_escalated') map[key].escalados++;
    if (row.resolution_type === 'abandoned') map[key].abandoned++;
  }

  return map;
}

// ── Redis ─────────────────────────────────────────────────────────────────────

async function queryRedis() {
  const result = {};
  let redis;

  try {
    redis = require('../lib/dedup').getRedis();
  } catch (_) {
    for (const q of REDIS_QUEUES) result[q] = 0;
    return result;
  }

  for (const queue of REDIS_QUEUES) {
    try {
      result[queue] = redis ? Number(await redis.llen(queue)) : 0;
    } catch (_) {
      result[queue] = 0;
    }
  }
  return result;
}

// ── Template ──────────────────────────────────────────────────────────────────

function formatBotLine(label, stats) {
  if (!stats) return `${label}: dados indisponíveis`;

  const avg = stats.msCount > 0
    ? (stats.totalMs / stats.msCount / 1000).toFixed(1)
    : '—';

  return `${label}: ${stats.msgs} msgs | ${avg}s avg | ${stats.llmErrors} erros | ${stats.escalados} escalados`;
}

function buildAlerts(botsData, queues, supabaseOk) {
  const alerts = [];

  if (!supabaseOk) {
    alerts.push('⚠ Supabase: dados indisponíveis — brief parcial');
  }

  for (const bot of BOTS) {
    const s = botsData[bot.id];
    if (!s) continue;
    if (supabaseOk && s.msgs === 0) alerts.push(`⚠ ${bot.label}: 0 mensagens (possível DOWN)`);
    if (s.msCount > 0 && s.totalMs / s.msCount > ALERT_SLOW_MS) {
      const sec = (s.totalMs / s.msCount / 1000).toFixed(1);
      alerts.push(`⚠ ${bot.label}: resposta lenta (${sec}s)`);
    }
  }

  const dlq = queues['pa-dead-letters'] || 0;
  if (dlq > 0) alerts.push(`⚠ DLQ: ${dlq} mensagens falhadas — verificar`);

  return alerts;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function generateBrief() {
  const [rows, queues] = await Promise.all([queryInsights(), queryRedis()]);

  const supabaseOk = rows !== null;
  const safeRows = supabaseOk ? rows : [];
  const botsData = aggregateByBot(safeRows);

  const date = new Date().toLocaleDateString('pt-AO', {
    timeZone: 'Africa/Luanda',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const alerts = buildAlerts(botsData, queues, supabaseOk);
  const alertText = alerts.length > 0 ? alerts.join('\n') : 'Nenhum';

  const dlq = queues['pa-dead-letters'] || 0;

  return [
    `[PA BRIEF 24h] ${date}`,
    formatBotLine('Zara', botsData['streamzone']),
    formatBotLine('Luna', botsData['luna']),
    formatBotLine('Bia',  botsData['demo']),
    `DLQ: ${dlq} pendentes`,
    `ALERTAS:\n${alertText}`,
  ].join('\n');
}

module.exports = { generateBrief, aggregateByBot, buildAlerts };
