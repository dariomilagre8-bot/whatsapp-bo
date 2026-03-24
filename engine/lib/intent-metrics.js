// engine/lib/intent-metrics.js — contadores em memória para /api/health/detailed

const counts = {
  saudacao: 0,
  venda: 0,
  suporte: 0,
  desconhecido: 0,
};

function bucketForIntent(intent) {
  if (!intent || typeof intent !== 'string') return 'desconhecido';
  if (intent.includes('SAUDACAO')) return 'saudacao';
  if (intent.includes('VENDA')) return 'venda';
  if (intent.includes('SUPORTE')) return 'suporte';
  if (intent.includes('DESCONHECIDO')) return 'desconhecido';
  return 'desconhecido';
}

function recordIntentDetected(intent) {
  const b = bucketForIntent(intent);
  counts[b] = (counts[b] || 0) + 1;
}

function getIntentStats() {
  return { ...counts };
}

module.exports = { recordIntentDetected, getIntentStats, bucketForIntent };
