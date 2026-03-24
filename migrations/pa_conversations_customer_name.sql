-- migrations/pa_conversations_customer_name.sql
-- Executar no Supabase pa-engine (SQL Editor)

ALTER TABLE pa_conversations ADD COLUMN IF NOT EXISTS customer_name TEXT;
CREATE INDEX IF NOT EXISTS idx_pa_conv_customer_name ON pa_conversations(customer_name);
