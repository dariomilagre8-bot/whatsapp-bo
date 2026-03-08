-- ══════════════════════════════════════════════════════════════
-- Tabela: clientes
-- Sistema de billing automático do Palanca Bot Engine
--
-- Como usar:
-- 1. Abrir o Supabase Dashboard → SQL Editor
-- 2. Colar este script e executar
-- 3. Configurar as variáveis de ambiente:
--    BILLING_ENABLED=true
--    BILLING_MULTICAIXA=numero_multicaixa_express
--    BILLING_CONTA=iban_ou_conta_bancaria
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa TEXT NOT NULL,
  numero_whatsapp TEXT NOT NULL UNIQUE,
  pacote TEXT DEFAULT 'basico',
  valor_mensal_kz INTEGER NOT NULL DEFAULT 0,
  data_inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activo BOOLEAN DEFAULT TRUE,
  ultimo_pagamento TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON clientes(numero_whatsapp);
CREATE INDEX IF NOT EXISTS idx_clientes_activo ON clientes(activo);

-- ══════════════════════════════════════════════════════════════
-- Exemplo de inserção de cliente:
--
-- INSERT INTO clientes (nome_empresa, numero_whatsapp, pacote, valor_mensal_kz)
-- VALUES ('Loja XYZ', '244912345678', 'premium', 25000);
-- ══════════════════════════════════════════════════════════════
