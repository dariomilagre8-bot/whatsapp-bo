// engine/catalog/catalogIndex.js — índice leve a partir de config.products (sem tocar em clients/)

'use strict';

function buildProductIndex(clientConfig) {
  const products = clientConfig && clientConfig.products;
  if (!products || typeof products !== 'object') return [];
  const out = [];
  for (const [platform, spec] of Object.entries(products)) {
    if (!spec || typeof spec.plans !== 'object') continue;
    for (const [planName, plan] of Object.entries(spec.plans)) {
      const id = `${platform}_${planName}`.toLowerCase().replace(/\s+/g, '_');
      out.push({
        product_id: id,
        name: `${platform} ${planName}`.replace(/\s+/g, ' ').trim(),
        category: 'streaming',
        price_kz: plan.price != null ? plan.price : 0,
      });
    }
  }
  return out;
}

function formatCatalogIndexForPrompt(clientConfig) {
  const idx = buildProductIndex(clientConfig);
  if (!idx.length) return '';
  const parts = idx.map((p) => {
    const n = Number(p.price_kz) || 0;
    const formatted = n.toLocaleString('pt-PT');
    return `${p.name} (${formatted} Kz)`;
  });
  return `Produtos disponíveis: ${parts.join(', ')}`;
}

function estimateCatalogIndexTokens(clientConfig) {
  return Math.ceil(formatCatalogIndexForPrompt(clientConfig).length / 4);
}

module.exports = { buildProductIndex, formatCatalogIndexForPrompt, estimateCatalogIndexTokens };
