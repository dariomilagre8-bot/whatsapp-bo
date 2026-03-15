-- Palanca Bot Engine v2.0 — Watchtower: tabela de insights diários
-- Executar no Supabase SQL Editor (Dashboard → SQL Editor)

CREATE TABLE IF NOT EXISTS pa_daily_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  messages_total INT DEFAULT 0,
  messages_from_clients INT DEFAULT 0,
  sales_completed INT DEFAULT 0,
  sales_abandoned INT DEFAULT 0,
  avg_response_time_ms INT DEFAULT 0,
  top_products JSONB DEFAULT '[]',
  sentiment_positive INT DEFAULT 0,
  sentiment_negative INT DEFAULT 0,
  sentiment_neutral INT DEFAULT 0,
  loss_reasons JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_slug, date)
);

CREATE INDEX IF NOT EXISTS idx_insights_client_date ON pa_daily_insights(client_slug, date);
