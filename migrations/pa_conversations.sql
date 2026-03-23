-- migrations/pa_conversations.sql
-- Tabela de log de conversas para auditoria (Don pode ver qualquer conversa no Supabase Dashboard)
-- Executar no Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS pa_conversations (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  direction   TEXT        NOT NULL CHECK (direction IN ('in', 'out')),
  message     TEXT        NOT NULL,
  intent      TEXT,
  llm_used    BOOLEAN     DEFAULT false,
  safe_guard  BOOLEAN     DEFAULT false, -- true se a resposta foi bloqueada pelo safe-guard
  trace_id    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_pa_conversations_phone    ON pa_conversations(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pa_conversations_slug     ON pa_conversations(client_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pa_conversations_intent   ON pa_conversations(intent) WHERE intent IS NOT NULL;

-- RLS: permitir todas as operações com service key
ALTER TABLE pa_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all" ON pa_conversations;
CREATE POLICY "service_all" ON pa_conversations FOR ALL USING (true);

-- ─── EXEMPLO DE CONSULTA PARA AUDITORIA ───────────────────────────────────────
-- Ver conversa completa de um número:
--   SELECT direction, message, intent, llm_used, safe_guard, created_at
--   FROM pa_conversations
--   WHERE phone = '244937761877'
--   ORDER BY created_at ASC;
--
-- Ver todas as mensagens bloqueadas pelo safe-guard:
--   SELECT phone, message, created_at
--   FROM pa_conversations
--   WHERE safe_guard = true
--   ORDER BY created_at DESC
--   LIMIT 50;
--
-- Ver actividade de hoje por cliente:
--   SELECT client_slug, phone, COUNT(*) as msgs
--   FROM pa_conversations
--   WHERE created_at > now() - interval '24 hours'
--   GROUP BY client_slug, phone
--   ORDER BY msgs DESC;
