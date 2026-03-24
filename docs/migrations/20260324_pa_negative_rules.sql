-- pa-engine (vxrziqsyfpnmpzkjkxli) — regras negativas de intent (self-annealing)
CREATE TABLE IF NOT EXISTS pa_negative_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT,
  input_pattern TEXT NOT NULL,
  wrong_intent TEXT NOT NULL,
  correct_intent TEXT NOT NULL,
  bug_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_pa_negative_rules_active ON pa_negative_rules (active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_pa_negative_rules_client ON pa_negative_rules (client_id);
