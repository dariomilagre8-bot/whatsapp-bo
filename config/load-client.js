// config/load-client.js — Resolve ACTIVE_CLIENT / CLIENT_SLUG → clients/<slug>/config.js
// Sem fallback silencioso para outro cliente: se o slug pedido não existir → erro explícito.

const fs = require('fs');
const path = require('path');

function listAvailableClientSlugs() {
  const clientsDir = path.join(__dirname, '..', 'clients');
  if (!fs.existsSync(clientsDir)) return [];
  return fs.readdirSync(clientsDir)
    .filter((d) => {
      const fullPath = path.join(clientsDir, d, 'config.js');
      return fs.existsSync(fullPath);
    });
}

function loadClientConfig() {
  const activeClient = process.env.ACTIVE_CLIENT;
  const clientSlug = process.env.CLIENT_SLUG || activeClient;

  const explicit = [...new Set([clientSlug, activeClient].filter(Boolean))];
  const slugsToTry = explicit.length > 0 ? explicit : ['streamzone'];

  for (const slug of slugsToTry) {
    const configPath = path.join(__dirname, '..', 'clients', slug, 'config.js');
    if (fs.existsSync(configPath)) {
      const cfg = require(configPath);
      const resolved = cfg.clientSlug || cfg.slug || slug;
      console.log(`[CONFIG] ✅ Carregado: clients/${slug}/config.js (slug: ${resolved})`);
      return { ...cfg, clientSlug: resolved };
    }
  }

  const available = listAvailableClientSlugs();
  throw new Error(
    `[CONFIG] Nenhum config encontrado para ACTIVE_CLIENT="${activeClient || ''}", CLIENT_SLUG="${clientSlug || ''}". ` +
    `Clientes disponíveis: [${available.join(', ')}]. ` +
    `Verifica que clients/${(clientSlug || activeClient || 'streamzone')}/config.js existe.`
  );
}

module.exports = loadClientConfig;
