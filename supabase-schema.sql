-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  whatsapp TEXT UNIQUE NOT NULL,
  email TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de vendas
CREATE TABLE IF NOT EXISTS vendas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id),
  whatsapp TEXT NOT NULL,
  plataforma TEXT NOT NULL,
  plano TEXT NOT NULL,
  quantidade INTEGER DEFAULT 1,
  valor_total INTEGER NOT NULL,
  data_venda TIMESTAMP DEFAULT NOW(),
  data_expiracao TIMESTAMP,
  status TEXT DEFAULT 'ativo'
);

-- Tabela de perfis entregues
CREATE TABLE IF NOT EXISTS perfis_entregues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venda_id UUID REFERENCES vendas(id),
  email_conta TEXT NOT NULL,
  senha_conta TEXT NOT NULL,
  nome_perfil TEXT,
  pin TEXT,
  plataforma TEXT NOT NULL,
  entregue_em TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_vendas_whatsapp ON vendas(whatsapp);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data_venda);
CREATE INDEX IF NOT EXISTS idx_vendas_status ON vendas(status);

-- Tabela de sessões ativas (persistência de conversas entre restarts do bot)
CREATE TABLE IF NOT EXISTS sessoes (
  whatsapp TEXT PRIMARY KEY,
  client_state JSONB,
  chat_history JSONB,
  pending_verification JSONB,
  is_paused BOOLEAN DEFAULT FALSE,
  last_intro_ts BIGINT,
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessoes_updated ON sessoes(updated_at);
