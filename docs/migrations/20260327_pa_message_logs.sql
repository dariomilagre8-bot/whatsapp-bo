-- Migration: pa_message_logs
-- Tabela de registo granular de mensagens para Watchtower
-- Projecto: pa-engine (vxrziqsyfpnmpzkjkxli)
-- Data: 2026-03-27

CREATE TABLE IF NOT EXISTS pa_message_logs (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_slug  TEXT NOT NULL,
  remote_jid   TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  message_text TEXT,
  intent       TEXT,
  state        TEXT,
  trace_id     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_logs_slug_date
  ON pa_message_logs(client_slug, created_at);

CREATE INDEX IF NOT EXISTS idx_msg_logs_direction
  ON pa_message_logs(direction, client_slug);

COMMENT ON TABLE pa_message_logs IS
  'Registo por mensagem para Watchtower BI — sem PII sensível (remote_jid pode ser anonimizado)';
