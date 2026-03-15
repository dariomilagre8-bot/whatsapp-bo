// engine/lib/metrics.js — Contadores por cliente (Prometheus-compatible)

const METRIC_NAMES = [
  'messages_received',
  'messages_sent',
  'regex_matches',
  'llm_calls',
  'llm_errors',
  'supervisor_notifications',
  'sales_completed',
  'sales_abandoned',
  'duplicates_blocked',
  'hallucinations_blocked',
];

const counters = {};

function getCounters(slug) {
  if (!counters[slug]) {
    counters[slug] = {};
    for (const name of METRIC_NAMES) {
      counters[slug][name] = 0;
    }
  }
  return counters[slug];
}

function increment(slug, metricName) {
  if (!METRIC_NAMES.includes(metricName)) return;
  const c = getCounters(slug);
  c[metricName] = (c[metricName] || 0) + 1;
}

function getPrometheusText() {
  const lines = [];
  for (const [slug, counts] of Object.entries(counters)) {
    for (const [metric, value] of Object.entries(counts)) {
      const name = `palanca_${metric}`;
      lines.push(`${name}{client="${slug}"} ${value}`);
    }
  }
  return lines.join('\n') || '# No metrics yet';
}

module.exports = { increment, getPrometheusText, getCounters, METRIC_NAMES };
