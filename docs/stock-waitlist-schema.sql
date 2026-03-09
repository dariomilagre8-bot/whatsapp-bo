-- docs/stock-waitlist-schema.sql
-- Lista de espera para notificação automática de reposição de stock
-- Executar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS stock_waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_cliente TEXT NOT NULL,
  nome_cliente TEXT,
  produto_desejado TEXT NOT NULL,
  data_pedido TIMESTAMPTZ DEFAULT NOW(),
  notificado BOOLEAN DEFAULT FALSE,
  data_notificacao TIMESTAMPTZ,
  vendido BOOLEAN DEFAULT FALSE,
  data_venda TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_produto ON stock_waitlist(produto_desejado);
CREATE INDEX IF NOT EXISTS idx_waitlist_notificado ON stock_waitlist(notificado);
CREATE INDEX IF NOT EXISTS idx_waitlist_numero ON stock_waitlist(numero_cliente);
