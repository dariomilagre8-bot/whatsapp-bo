// engine/catalog/catalogLookup.js — detalhes on-demand (fuzzy includes)

'use strict';

const { buildProductIndex } = require('./catalogIndex');

function defaultPaymentHint(clientConfig) {
  const p = clientConfig && clientConfig.payment;
  if (!p) return 'Envie o comprovativo após pagamento (imagem ou PDF).';
  const methods = Array.isArray(p.methods) ? p.methods.join(', ') : '';
  return `Pagamento: ${methods || 'dados enviados no funil'}. Envie comprovativo por aqui.`;
}

function buildDetails(entry, clientConfig) {
  return {
    product_id: entry.product_id,
    name: entry.name,
    price_kz: entry.price_kz,
    category: entry.category,
    description: `Plano ${entry.name} — preço mensal indicado no catálogo.`,
    como_comprar: defaultPaymentHint(clientConfig),
  };
}

function scoreMatch(entry, q) {
  const name = entry.name.toLowerCase();
  if (!q) return 0;
  if (name.includes(q) || q.includes(name)) return 100;
  const qw = q.split(/\s+/).filter((w) => w.length > 2);
  let s = 0;
  for (const w of qw) {
    if (name.includes(w)) s += 20;
    if (entry.product_id.includes(w)) s += 15;
  }
  return s;
}

function getProductDetails(clientConfig, productQuery) {
  const idx = buildProductIndex(clientConfig);
  if (!idx.length) return null;
  const q = String(productQuery || '').toLowerCase().trim();
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const e of idx) {
    const sc = scoreMatch(e, q);
    if (sc > bestScore) {
      bestScore = sc;
      best = e;
    }
  }
  if (!best || bestScore < 20) return null;
  return buildDetails(best, clientConfig);
}

function extractProductQuery(userMessage) {
  return String(userMessage || '').trim();
}

module.exports = { getProductDetails, extractProductQuery, buildDetails };
