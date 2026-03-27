// services/watchtower/index.js — Orquestrador Watchtower (extract → analyze → upsert → deliver)
'use strict';

const { createLogger } = require('../../engine/lib/logger');
const { extractAll, extractForClient, yesterdayUtc } = require('./extract');
const { analyze } = require('./analyze');
const { deliver } = require('./deliver');

function getSupabase() {
  return require('../../src/integrations/supabase').getClient();
}

/**
 * Faz upsert em pa_daily_insights para o registo analisado.
 */
async function upsertInsight(sbClient, record) {
  const { error } = await sbClient
    .from('pa_daily_insights')
    .upsert({
      client_slug:          record.client_slug,
      date:                 record.date,
      messages_total:       record.messages_total,
      messages_from_clients: record.messages_from_clients,
      sales_completed:      record.sales_completed,
      sales_abandoned:      record.sales_abandoned,
      sentiment_positive:   record.sentiment_positive,
      sentiment_negative:   record.sentiment_negative,
      sentiment_neutral:    record.sentiment_neutral,
      top_products:         record.top_products,
      loss_reasons:         record.loss_reasons,
    }, {
      onConflict: 'client_slug,date',
      ignoreDuplicates: false,
    });

  return error;
}

/**
 * extractOnly: extrai + analisa + grava em pa_daily_insights (sem enviar por WhatsApp).
 * Corre diariamente às 06h Angola.
 */
async function extractOnly(dateStr) {
  const traceId = require('crypto').randomUUID();
  const log = createLogger(traceId, 'watchtower', 'watchtower');
  const sbClient = getSupabase();

  if (!sbClient) {
    log.warn('extractOnly: Supabase não disponível');
    return;
  }

  const date = dateStr || yesterdayUtc();
  log.info('extractOnly início', { date });

  try {
    const extractions = await extractAll(sbClient, date);
    if (!extractions.length) {
      log.info('extractOnly: sem actividade no dia', { date });
      return;
    }

    for (const extracted of extractions) {
      const record  = analyze(extracted);
      const upsertErr = await upsertInsight(sbClient, record);
      if (upsertErr) {
        log.warn('upsert pa_daily_insights falhou', { client_slug: record.client_slug, error: upsertErr.message });
      } else {
        log.info('insight gravado', { client_slug: record.client_slug, date: record.date });
      }
    }

    log.info('extractOnly concluído', { clients: extractions.length });
  } catch (err) {
    log.error('extractOnly erro', { error: err.message });
  }
}

/**
 * run: extract + analyze + upsert + deliver (resumo WhatsApp).
 * Corre semanalmente às sextas 18h Angola.
 */
async function run(dateStr) {
  const traceId = require('crypto').randomUUID();
  const log = createLogger(traceId, 'watchtower', 'watchtower');
  const sbClient = getSupabase();

  if (!sbClient) {
    log.warn('run: Supabase não disponível');
    return;
  }

  const date = dateStr || yesterdayUtc();
  log.info('watchtower run início', { date });

  try {
    const extractions = await extractAll(sbClient, date);
    if (!extractions.length) {
      log.info('run: sem actividade no dia', { date });
      return;
    }

    for (const extracted of extractions) {
      const record     = analyze(extracted);
      const upsertErr  = await upsertInsight(sbClient, record);
      if (upsertErr) {
        log.warn('upsert falhou', { client_slug: record.client_slug, error: upsertErr.message });
      }
      await deliver(record.client_slug, record);
    }

    log.info('watchtower run concluído', { clients: extractions.length });
  } catch (err) {
    log.error('watchtower run erro', { error: err.message });
  }
}

module.exports = { run, extractOnly, upsertInsight };
