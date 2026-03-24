-- pa-engine: nome do cliente nas conversas (PA Dashboard)
-- Projecto: vxrziqsyfpnmpzkjkxli (eu-west-2)

ALTER TABLE pa_conversations ADD COLUMN IF NOT EXISTS customer_name TEXT;
CREATE INDEX IF NOT EXISTS idx_pa_conv_customer_name ON pa_conversations(customer_name);
