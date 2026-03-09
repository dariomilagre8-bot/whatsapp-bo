-- docs/crm-schema.sql
-- CRM básico de tracking de leads e clientes
-- Executar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  nome TEXT,
  status TEXT DEFAULT 'novo' CHECK (status IN ('novo', 'interessado', 'comprou', 'recorrente', 'inactivo')),
  primeiro_contacto TIMESTAMPTZ DEFAULT NOW(),
  ultimo_contacto TIMESTAMPTZ DEFAULT NOW(),
  total_mensagens INTEGER DEFAULT 0,
  total_compras INTEGER DEFAULT 0,
  valor_total_compras NUMERIC DEFAULT 0,
  ultima_compra TIMESTAMPTZ,
  produtos_interesse TEXT[],
  fonte TEXT DEFAULT 'directo',
  notas TEXT,
  follow_up_enviado BOOLEAN DEFAULT FALSE,
  data_follow_up TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_numero ON leads(numero);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_ultimo_contacto ON leads(ultimo_contacto);
CREATE INDEX IF NOT EXISTS idx_leads_ultima_compra ON leads(ultima_compra);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_leads_updated_at();

-- Caso a tabela leads já exista sem as colunas de follow-up, adicionar:
-- ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_enviado BOOLEAN DEFAULT FALSE;
-- ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_follow_up TIMESTAMPTZ;
