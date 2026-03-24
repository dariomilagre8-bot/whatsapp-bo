-- pa-engine (vxrziqsyfpnmpzkjkxli) — KPIs por mensagem + view agregada
-- SQL Editor → executar uma vez

ALTER TABLE pa_daily_insights
  DROP CONSTRAINT IF EXISTS pa_daily_insights_client_slug_date_key;

ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS llm_provider TEXT;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS llm_success BOOLEAN DEFAULT true;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS intent_detected TEXT;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS intent_confidence DOUBLE PRECISION;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS resolution_type TEXT;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS csat_score INTEGER;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS llm_routing_reason TEXT;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE pa_daily_insights ADD COLUMN IF NOT EXISTS phone TEXT;

UPDATE pa_daily_insights SET client_id = client_slug WHERE client_id IS NULL AND client_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pa_insights_client_created ON pa_daily_insights(client_id, created_at DESC);

CREATE OR REPLACE VIEW v_kpis_operacionais AS
SELECT
  client_id,
  date_trunc('day', created_at AT TIME ZONE 'UTC') AS dia,
  COUNT(*) AS total_mensagens,
  AVG(response_time_ms) AS tempo_medio_ms,
  COUNT(*) FILTER (WHERE llm_success IS FALSE) * 100.0 / NULLIF(COUNT(*), 0) AS taxa_erro_llm,
  COUNT(*) FILTER (WHERE llm_provider = 'gemini') * 100.0 / NULLIF(COUNT(*), 0) AS failover_rate,
  COUNT(*) FILTER (WHERE resolution_type = 'bot_resolved') * 100.0 / NULLIF(COUNT(*), 0) AS deflection_rate,
  AVG(csat_score) FILTER (WHERE csat_score IS NOT NULL) AS csat_medio,
  COUNT(*) FILTER (WHERE llm_routing_reason = 'simple') * 100.0 / NULLIF(COUNT(*), 0) AS pct_simple_routing,
  COALESCE(SUM(tokens_used), 0) AS total_tokens
FROM pa_daily_insights
WHERE client_id IS NOT NULL
GROUP BY client_id, date_trunc('day', created_at AT TIME ZONE 'UTC');
