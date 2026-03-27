// services/watchtower/extract.js — Extracção de métricas do dia anterior a partir de pa_message_logs
'use strict';

const { createLogger } = require('../../engine/lib/logger');

/**
 * Retorna a data UTC de ontem no formato YYYY-MM-DD.
 */
function yesterdayUtc() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Extrai métricas básicas do pa_message_logs para um client_slug e data específicos.
 * @param {object} sbClient - Cliente Supabase já inicializado
 * @param {string} clientSlug
 * @param {string} [dateStr] - YYYY-MM-DD (default: ontem UTC)
 * @returns {Promise<object>} métricas
 */
async function extractForClient(sbClient, clientSlug, dateStr) {
  const date = dateStr || yesterdayUtc();
  const traceId = require('crypto').randomUUID();
  const log = createLogger(traceId, clientSlug, 'watchtower-extract');

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd   = `${date}T23:59:59.999Z`;

  log.info('extract início', { date });

  // Total de mensagens IN (de clientes)
  const { count: messagesFromClients, error: errIn } = await sbClient
    .from('pa_message_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_slug', clientSlug)
    .eq('direction', 'in')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  if (errIn) log.warn('Erro count IN', { error: errIn.message });

  // Total de mensagens OUT (bot)
  const { count: messagesOut, error: errOut } = await sbClient
    .from('pa_message_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_slug', clientSlug)
    .eq('direction', 'out')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  if (errOut) log.warn('Erro count OUT', { error: errOut.message });

  const messagesTotal = (messagesFromClients || 0) + (messagesOut || 0);

  // Vendas completadas: intents INTENT_VENDA com estado 'pago' ou message #RESUMO_VENDA
  const { count: salesCompleted, error: errSales } = await sbClient
    .from('pa_message_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_slug', clientSlug)
    .eq('direction', 'in')
    .eq('state', 'pago')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  if (errSales) log.warn('Erro count vendas', { error: errSales.message });

  // Vendas abandonadas: chegaram a checkout (state='aguarda_pagamento') mas nunca fecharam
  const { count: salesAbandoned, error: errAbandoned } = await sbClient
    .from('pa_message_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_slug', clientSlug)
    .eq('direction', 'in')
    .eq('state', 'aguarda_pagamento')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  if (errAbandoned) log.warn('Erro count abandoned', { error: errAbandoned.message });

  // Produtos mencionados (intent INTENT_VENDA, mensagens IN)
  const { data: intentRows, error: errIntents } = await sbClient
    .from('pa_message_logs')
    .select('intent, message_text')
    .eq('client_slug', clientSlug)
    .eq('direction', 'in')
    .eq('intent', 'INTENT_VENDA')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .limit(200);

  if (errIntents) log.warn('Erro fetch intents', { error: errIntents.message });

  const result = {
    client_slug:          clientSlug,
    date,
    messages_total:       messagesTotal,
    messages_from_clients: messagesFromClients || 0,
    sales_completed:      salesCompleted  || 0,
    sales_abandoned:      salesAbandoned  || 0,
    raw_intent_rows:      intentRows      || [],
  };

  log.info('extract concluído', {
    messages_total: result.messages_total,
    sales_completed: result.sales_completed,
  });

  return result;
}

/**
 * Extrai para todos os client_slugs distintos que têm actividade no dia.
 * @param {object} sbClient
 * @param {string} [dateStr]
 */
async function extractAll(sbClient, dateStr) {
  const date = dateStr || yesterdayUtc();
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd   = `${date}T23:59:59.999Z`;

  const { data: slugRows } = await sbClient
    .from('pa_message_logs')
    .select('client_slug')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  const slugs = [...new Set((slugRows || []).map(r => r.client_slug).filter(Boolean))];
  if (!slugs.length) return [];

  return Promise.all(slugs.map(slug => extractForClient(sbClient, slug, date)));
}

module.exports = { extractForClient, extractAll, yesterdayUtc };
