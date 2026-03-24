-- pa-engine: log de outreach (preparação manual, sem envio automático)
-- Projecto: vxrziqsyfpnmpzkjkxli (eu-west-2)

CREATE TABLE IF NOT EXISTS pa_outreach_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_name TEXT NOT NULL,
  lead_phone TEXT,
  lead_niche TEXT,
  template_used TEXT,
  message_text TEXT,
  sent_at TIMESTAMPTZ,
  follow_up_1_at TIMESTAMPTZ,
  follow_up_2_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'prepared',
  response_text TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pa_outreach_lead_name ON pa_outreach_log(lead_name);
CREATE INDEX IF NOT EXISTS idx_pa_outreach_status ON pa_outreach_log(status);
CREATE INDEX IF NOT EXISTS idx_pa_outreach_sent_at ON pa_outreach_log(sent_at);

COMMENT ON TABLE pa_outreach_log IS 'Outreach Palanca: mensagens preparadas na CLI; envio sempre manual no WhatsApp.';
